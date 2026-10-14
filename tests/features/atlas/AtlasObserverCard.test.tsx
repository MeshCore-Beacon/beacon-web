import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../../../src/api/client";
import { MyAtlasPage } from "../../../src/features/atlas/MyAtlasPage";
import { ATLAS_KEY, ATLAS_LEGACY_KEY } from "../../../src/features/atlas/atlas-storage";
import type { Observer, ObserverDirectoryPage } from "../../../src/features/observers/types";
import type { ObserverActivity, ObserverTelemetry } from "../../../src/features/stats/types";

vi.mock("../../../src/api/client", async original => ({ ...(await original<typeof import("../../../src/api/client")>()), getObserver: vi.fn(), getObserverActivity: vi.fn(), getObserverTelemetry: vi.fn(), getObserverDirectoryPage: vi.fn(), getNodesPage: vi.fn(), getNode: vi.fn(), getNodeObservations: vi.fn() }));
const pin = { kind: "observer", id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "Home observer" };
const observer = { ...pin, displayName: pin.name, status: "online", lastStatusAt: Date.now(), lastSeen: Date.now(), batteryLevel: 4.12, uptimeSeconds: 3600 } as Observer;
const clients: QueryClient[] = [];
const view = vi.fn();
function mount(active = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><MyAtlasPage active={active} onViewNode={vi.fn()} onViewObserver={view} onAnalyzePacket={vi.fn()} /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.mocked(api.getObserver).mockResolvedValue(observer);
  vi.mocked(api.getObserverActivity).mockResolvedValue({ range: "24h", interval: "1h", windowEnd: Date.now(), points: [{ t: Date.now(), observations: 8, snrAvg: 0, rssiAvg: -95, airtimeMs: null, snrMin: 0 }] } as ObserverActivity);
  vi.mocked(api.getObserverTelemetry).mockResolvedValue({ range: "24h", interval: "1h", points: [] } as ObserverTelemetry);
  vi.mocked(api.getObserverDirectoryPage).mockResolvedValue({ items: [observer], hasMore: false } as unknown as ObserverDirectoryPage);
});
afterEach(() => { clients.splice(0).forEach(c => c.clear()); });
it("restores an observer card, shows available history, changes range and opens observer detail", async () => {
  localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 2, range: "24h", cards: [pin] }));
  mount();
  expect(await screen.findByText("4.12V")).toBeInTheDocument();
  expect(await screen.findByText("0 dB")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: pin.name })); expect(view).toHaveBeenCalledWith(pin.id);
  fireEvent.click(screen.getByRole("button", { name: "3d" }));
  await waitFor(() => expect(api.getObserverActivity).toHaveBeenCalledWith(pin.id, "72h", "1h", undefined, expect.any(AbortSignal)));
  expect(api.getObserverTelemetry).toHaveBeenCalledWith(pin.id, "72h", "1h", undefined, expect.any(AbortSignal));
});
it("does not turn missing device data or an unavailable history endpoint into zeros", async () => {
  localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 2, cards: [pin] }));
  vi.mocked(api.getObserver).mockResolvedValue({ ...observer, batteryLevel: undefined, uptimeSeconds: undefined });
  vi.mocked(api.getObserverTelemetry).mockRejectedValue(new api.ApiError(503, "busy", "unavailable"));
  mount(); await screen.findByRole("alert");
  expect(screen.queryByText("0.00V")).not.toBeInTheDocument();
  expect(screen.getByText("0 dB")).toBeInTheDocument();
  expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
});
it("queries nothing for inactive saved observers", () => {
  localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 2, cards: [pin] })); mount(false);
  expect(api.getObserver).not.toHaveBeenCalled(); expect(api.getObserverActivity).not.toHaveBeenCalled(); expect(api.getObserverTelemetry).not.toHaveBeenCalled();
});
it("adds an observer by name without rewriting the legacy node store", async () => {
  const original = JSON.stringify({ version: 1, range: "24h", nodes: [] }); localStorage.setItem(ATLAS_LEGACY_KEY, original);
  mount();
  fireEvent.click(screen.getByRole("button", { name: /Name/ }));
  fireEvent.click(screen.getByRole("button", { name: "Observers", exact: true }));
  fireEvent.change(screen.getByRole("textbox", { name: "Find an observer" }), { target: { value: "Home" } });
  fireEvent.click(await screen.findByRole("button", { name: "Add Home observer" }));
  await screen.findByText("4.12V");
  expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).cards).toEqual([pin]);
  expect(localStorage.getItem(ATLAS_LEGACY_KEY)).toBe(original);
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).cards).toEqual([]));
});

it("preserves legacy nodes while reordering a mixed dashboard", async () => {
  const node = { id: "22222222-2222-4222-8222-222222222222", publicKey: "cd".repeat(32), name: "Repeater", nodeTypeName: "REPEATER", knownNeighborCount: 0, iatas: [] };
  const original = JSON.stringify({ version: 1, range: "24h", nodes: [node] });
  localStorage.setItem(ATLAS_LEGACY_KEY, original);
  vi.mocked(api.getNode).mockResolvedValue(node as never);
  vi.mocked(api.getNodeObservations).mockResolvedValue({ items: [], hasMore: false });
  mount(); await screen.findByRole("button", { name: "Repeater", exact: true });
  fireEvent.click(screen.getByRole("button", { name: /Name/ }));
  fireEvent.click(screen.getByRole("button", { name: "Observers", exact: true }));
  fireEvent.change(screen.getByRole("textbox", { name: "Find an observer" }), { target: { value: "Home" } });
  fireEvent.click(await screen.findByRole("button", { name: "Add Home observer" }));
  await screen.findByText("4.12V");
  fireEvent.keyDown(screen.getAllByRole("button", { name: "Drag to reorder" })[1]!, { key: "ArrowLeft" });
  const saved = JSON.parse(localStorage.getItem(ATLAS_KEY)!);
  expect(saved.cards.map((p: { kind: string }) => p.kind)).toEqual(["observer", "node"]);
  expect(saved.cards[1].publicKey).toBe(node.publicKey);
  expect(localStorage.getItem(ATLAS_LEGACY_KEY)).toBe(original);
});
