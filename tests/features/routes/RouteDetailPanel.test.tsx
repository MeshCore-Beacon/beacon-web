import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { RouteDetailPanel } from "../../../src/features/routes/RouteDetailPanel";
import { getRouteEvidence } from "../../../src/api/client";
import type { KnownRoute, RouteEvidence } from "../../../src/types/api";
import i18n from "../../../src/i18n";

vi.mock("../../../src/api/client", () => ({ getRouteEvidence: vi.fn(), isNotFound: () => false }));
const key = "a".repeat(32);
const route: KnownRoute = { id: 9, pathKey: key, iata: "YOW", hopCount: 2, hops: [{ nodeId: "n1", hashBytes: "ab", node: { id: "n1", publicKey: "abcd", name: "North" } }], firstSeen: 1, lastSeen: 2, observationCount: 1234 };
const page: RouteEvidence = {
  route,
  windowStart: 1700000000000, windowEnd: 1700086400000, generatedAt: 1700086400001,
  matchType: "saved_path_prefixes", matchAvailable: true, hashSize: 1, pathBytes: "abcd",
  items: [{ id: 17, packetHash: "aabb", observerId: "o1", observerName: "Garden", heardAt: 1700000000001, payloadType: 2, payloadTypeName: "TXT_MSG", snr: 0 }], hasMore: true, nextPageCursor: "pinned-cursor",
};
const inspect = vi.fn(); const observer = vi.fn();
function Harness({ listed }: { listed?: KnownRoute }) {
  const [params, set] = useSearchParams();
  return <><button onClick={() => set({ route: "b".repeat(32) })}>Other route</button>
    <button onClick={() => set(p => { const next = new URLSearchParams(p); next.set("routeHashSize", "2"); next.set("routePathBytes", "ab01cd02"); return next; })}>Other width</button>
    <RouteDetailPanel route={listed} iata="YOW" pathKey={params.get("route") ?? key} onClose={() => {}} onAnalyzePacket={inspect} onViewObserver={observer} /></>;
}
function mount({ url = "/?tab=Routes", listed }: { url?: string; listed?: KnownRoute } = {}) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[url]}><Harness listed={listed} /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getRouteEvidence).mockResolvedValue(page); });

describe("route detail", () => {
  it("lists recent packets as far back as the server keeps them, with no window picker", async () => {
    mount({ url: "/?routeRange=7d" });
    await screen.findByText("Garden");
    expect(getRouteEvidence).toHaveBeenCalledWith("YOW", key, { range: "720h", limit: 50 }, expect.anything());
    expect(screen.queryByRole("button", { name: "24h" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "7d" })).not.toBeInTheDocument();
  });

  it("requests and shares the pinned window and prefix representation", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    mount({ url: "/?routeSince=1700000000000&routeUntil=1700086400000&routeHashSize=1&routePathBytes=abcd" });
    await screen.findByText("Garden");
    expect(getRouteEvidence).toHaveBeenCalledWith("YOW", key, { since: 1700000000000, until: 1700086400000, hashSize: 1, pathBytes: "abcd", limit: 50 }, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const link = new URL(vi.mocked(navigator.clipboard.writeText).mock.calls[0]![0]);
    expect(link.searchParams.get("routeSince")).toBe(String(page.windowStart));
    expect(link.searchParams.get("routeUntil")).toBe(String(page.windowEnd));
    expect(link.searchParams.get("routeHashSize")).toBe("1");
    expect(link.searchParams.get("routePathBytes")).toBe("abcd");
  });

  it("replaces reports when the pinned bytes change without changing the route key", async () => {
    mount({ url: "/?routeHashSize=1&routePathBytes=abcd" }); await screen.findByText("Garden");
    vi.mocked(getRouteEvidence).mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByText("Other width"));
    expect(screen.queryByText("Garden")).not.toBeInTheDocument();
    expect(getRouteEvidence).toHaveBeenLastCalledWith("YOW", key, { range: "720h", hashSize: 2, pathBytes: "ab01cd02", limit: 50 }, expect.anything());
  });

  it.each(["routeHashSize=1", "routePathBytes=abcd", "routeHashSize=1&routeHashSize=2&routePathBytes=abcd", "routeHashSize=4&routePathBytes=abcd", "routeHashSize=01&routePathBytes=abcd", "routeHashSize=1&routePathBytes=ab", "routeHashSize=2&routePathBytes=abcde", "routeHashSize=1&routePathBytes=ABCD", "routeSince=bad", "routeSince=1&routeUntil=2678400001", "routeSince=1&routeSince=2&routeUntil=3"])("rejects invalid pinned selectors: %s", async selector => {
    mount({ url: "/?" + selector });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(getRouteEvidence).not.toHaveBeenCalled();
  });

  it("shows the route's lifetime summary from the listed route before packets load", () => {
    vi.mocked(getRouteEvidence).mockReturnValue(new Promise(() => {}));
    mount({ listed: route });
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("North")).toBeInTheDocument();
    expect(screen.getByText("First seen")).toBeInTheDocument();
  });

  it("fills the summary from the packet response when opened from a shared link", async () => {
    mount();
    expect(await screen.findByText("1,234")).toBeInTheDocument();
  });


  it("opens the exact report and observer, and pins cursor pages", async () => {
    mount();
    await screen.findByText("Garden");
    fireEvent.click(screen.getByRole("button", { name: "Inspect packet" }));
    expect(inspect).toHaveBeenCalledWith("aabb", 17);
    fireEvent.click(screen.getByRole("button", { name: "Inspect observer" }));
    expect(observer).toHaveBeenCalledWith("o1");
    vi.mocked(getRouteEvidence).mockResolvedValue({ ...page, items: [], hasMore: false });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(getRouteEvidence).toHaveBeenLastCalledWith("YOW", key, { pageCursor: "pinned-cursor", limit: 50 }, expect.anything()));
  });

  it("replaces results when the route changes, even while its request is pending", async () => {
    mount(); await screen.findByText("Garden");
    vi.mocked(getRouteEvidence).mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByText("Other route"));
    expect(screen.queryByText("Garden")).not.toBeInTheDocument();
  });

  it("says when no observations on the route are still kept", async () => {
    vi.mocked(getRouteEvidence).mockResolvedValue({ ...page, items: [], hasMore: false });
    mount({ listed: route });
    expect(await screen.findByText(/No observations on this route are still kept/)).toBeInTheDocument();
  });

  it("does not fetch packets for a legacy route without a path key", () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><RouteDetailPanel route={{ ...route, pathKey: undefined }} onClose={() => {}} /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByText("North")).toBeInTheDocument();
    expect(getRouteEvidence).not.toHaveBeenCalled();
  });

  it("distinguishes an unmatchable route and translates the panel", async () => {
    await i18n.changeLanguage("fr");
    vi.mocked(getRouteEvidence).mockResolvedValue({ ...page, matchAvailable: false, items: [], hasMore: false });
    mount();
    expect(await screen.findByText(/Ce trajet ne peut pas être comparé/)).toBeInTheDocument();
    await i18n.changeLanguage("en");
  });

  it("keeps a failed next page separate from the reports already loaded", async () => {
    mount(); await screen.findByText("Garden");
    vi.mocked(getRouteEvidence).mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
    expect(screen.getByText("Garden")).toBeInTheDocument();
    vi.mocked(getRouteEvidence).mockResolvedValue({ ...page, items: [], hasMore: false });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("colours a good SNR report the same way every other SNR cell does", async () => {
    vi.mocked(getRouteEvidence).mockResolvedValue({ ...page, items: [{ ...page.items[0]!, snr: 12 }], hasMore: false });
    mount();
    expect(await screen.findByText("12.00")).toHaveClass("text-green");
  });

  it("translates the summary section titles and labels", async () => {
    await i18n.changeLanguage("fr");
    vi.mocked(getRouteEvidence).mockReturnValue(new Promise(() => {}));
    mount({ listed: route });
    expect(screen.getByText("Détail du trajet")).toBeInTheDocument();
    expect(screen.getByText("Résumé")).toBeInTheDocument();
    expect(screen.getByText("Horodatages")).toBeInTheDocument();
    expect(screen.getByText("Première réception")).toBeInTheDocument();
  });
});
