import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { RouteEvidencePanel } from "../../../src/features/routes/RouteEvidencePanel";
import { getRouteEvidence } from "../../../src/api/client";
import type { RouteEvidence } from "../../../src/types/api";
import i18n from "../../../src/i18n";

vi.mock("../../../src/api/client", () => ({ getRouteEvidence: vi.fn(), isNotFound: () => false }));
const key = "a".repeat(32);
const page: RouteEvidence = {
  route: { id: 9, pathKey: key, iata: "YOW", hopCount: 2, hops: [{ nodeId: "n1", hashBytes: "ab", node: { id: "n1", publicKey: "abcd", name: "North" } }], firstSeen: 1, lastSeen: 2, observationCount: 200 },
  windowStart: 1700000000000, windowEnd: 1700086400000, generatedAt: 1700086400001,
  matchType: "saved_path_prefixes", matchAvailable: true, hashSize: 1, pathBytes: "abcd",
  items: [{ id: 17, packetHash: "aabb", observerId: "o1", observerName: "Garden", heardAt: 1700000000001, payloadType: 2, payloadTypeName: "TXT_MSG", snr: 0 }], hasMore: true, nextPageCursor: "pinned-cursor",
};
const inspect = vi.fn(); const observer = vi.fn(); const node = vi.fn();
function Harness() {
  const [params, set] = useSearchParams();
  return <><button onClick={() => set({ route: "b".repeat(32) })}>Other route</button><output>{params.toString()}</output>
    <RouteEvidencePanel iata="YOW" pathKey={params.get("route") ?? key} onClose={() => {}} onAnalyzePacket={inspect} onViewObserver={observer} onViewNode={node} /></>;
}
function mount(url = "/?tab=Routes") {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[url]}><Harness /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getRouteEvidence).mockResolvedValue(page); });
describe("retained route evidence", () => {
  it("normalizes an old month link to 72 hours and offers only retained periods", async () => {
    mount("/?routeRange=30d");
    await screen.findByText("Garden");
    expect(getRouteEvidence).toHaveBeenCalledWith("YOW", key, { range: "72h", limit: 50 }, expect.anything());
    expect(screen.getByRole("button", { name: "3d" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "7 days" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "30 days" })).not.toBeInTheDocument();
  });
  it("does not request a shared raw-evidence period longer than three days", async () => {
    mount("/?routeSince=1700000000000&routeUntil=1700345600000");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(getRouteEvidence).not.toHaveBeenCalled();
  });
  it("opens the exact report and observer, names the saved route, and pins cursor pages", async () => {
    mount();
    await screen.findByText("Garden");
    expect(screen.getByText(/not proof of the same physical route/)).toBeInTheDocument();
    expect(screen.getByText("North")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect report" }));
    expect(inspect).toHaveBeenCalledWith("aabb", 17);
    fireEvent.click(screen.getByRole("button", { name: "Inspect observer" }));
    expect(observer).toHaveBeenCalledWith("o1");
    vi.mocked(getRouteEvidence).mockResolvedValue({ ...page, items: [], hasMore: false });
    fireEvent.click(screen.getByRole("button", { name: "Load more reports" }));
    await waitFor(() => expect(getRouteEvidence).toHaveBeenLastCalledWith("YOW", key, { pageCursor: "pinned-cursor", limit: 50 }, expect.anything()));
  });
  it("replaces results when the route changes, even while its request is pending", async () => {
    mount(); await screen.findByText("Garden");
    vi.mocked(getRouteEvidence).mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByText("Other route"));
    expect(screen.queryByText("Garden")).not.toBeInTheDocument();
    expect(screen.getByText("Loading retained reports…")).toBeInTheDocument();
  });
  it("uses shared fixed boundaries, then drops them when a new range is selected", async () => {
    mount("/?routeSince=1700000000000&routeUntil=1700086400000");
    await screen.findByText("Garden");
    expect(getRouteEvidence).toHaveBeenCalledWith("YOW", key, { since: 1700000000000, until: 1700086400000, limit: 50 }, expect.anything());
    expect(screen.getByText("Shared time window")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3d" }));
    await waitFor(() => expect(getRouteEvidence).toHaveBeenLastCalledWith("YOW", key, { range: "72h", limit: 50 }, expect.anything()));
    expect(screen.getByText(/routeRange=3d/)).not.toHaveTextContent("routeSince");
  });
  it("does not replace an invalid shared window with an unrelated default", async () => {
    mount("/?routeSince=bad");
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid shared time window");
    expect(getRouteEvidence).not.toHaveBeenCalled();
  });
  it("explains expired or absent evidence without presenting the historical counter as a total", async () => {
    vi.mocked(getRouteEvidence).mockResolvedValue({ ...page, items: [], hasMore: false });
    mount();
    expect(await screen.findByText(/No retained reports match/)).toBeInTheDocument();
    expect(screen.queryByText("200")).not.toBeInTheDocument();
  });
  it("distinguishes unavailable saved prefixes and translates the panel", async () => {
    await i18n.changeLanguage("fr");
    vi.mocked(getRouteEvidence).mockResolvedValue({ ...page, matchAvailable: false, items: [], hasMore: false });
    mount();
    expect(await screen.findByText(/préfixes enregistrés ne permettent pas/)).toBeInTheDocument();
    expect(screen.getByText("Rapports conservés")).toBeInTheDocument();
  });
  it("keeps a failed next page separate from the reports already loaded", async () => {
    mount(); await screen.findByText("Garden");
    vi.mocked(getRouteEvidence).mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Load more reports" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load retained reports");
    expect(screen.getByText("Garden")).toBeInTheDocument();
    vi.mocked(getRouteEvidence).mockResolvedValue({ ...page, items: [], hasMore: false });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
