import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyAtlasPage } from "../../../src/features/atlas/MyAtlasPage";
import { ATLAS_KEY, loadAtlasNode } from "../../../src/features/atlas/atlas";
import * as api from "../../../src/api/client";
import type { Node } from "../../../src/features/nodes/types";
import type { PacketDetail } from "../../../src/types/api";
import i18n from "../../../src/i18n";

vi.mock("../../../src/api/client", () => ({ getNodesPage: vi.fn(), getNode: vi.fn(), getNodeObservations: vi.fn(), getPacketDetail: vi.fn() }));
const pin = { id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "Old name" };
const second = { ...pin, id: "22222222-2222-4222-8222-222222222222", publicKey: "cd".repeat(32), name: "Second" };
const node = { ...pin, name: "Renamed repeater", nodeType: 2, nodeTypeName: "REPEATER", knownNeighborCount: 4, stale: false, lastSeen: Date.now(), iatas: [], lat: null, lng: null } as Node;
const report = { id: 7, packetHash: "ef".repeat(32), payloadType: 4, payloadTypeName: "ADVERT", iata: "YKF", heardAt: Date.now() - 1000, snr: 0, rssi: -106, hopCount: 2 };
const actions = { onViewNode: vi.fn(), onViewObserver: vi.fn(), onAnalyzePacket: vi.fn() };
const clients: QueryClient[] = [];
function mount(active = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><MyAtlasPage {...actions} active={active} /></QueryClientProvider>);
}
function save(nodes = [pin]) { localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 1, nodes, range: "24h" })); }
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.mocked(api.getNodesPage).mockResolvedValue({ items: [node], hasMore: false, nextCursor: null });
  vi.mocked(api.getNode).mockImplementation(async id => id === second.id ? { ...node, ...second } : node);
  vi.mocked(api.getNodeObservations).mockResolvedValue({ items: [report], hasMore: true, nextCursor: 7 });
  vi.mocked(api.getPacketDetail).mockResolvedValue({ packetHash: report.packetHash, originPubkey: pin.publicKey, header: { payloadType: 4 }, observations: [
    { observerId: "observer-a", observerName: "Home listener", id: 1, heardAt: 1, iata: "YKF" },
    { observerId: "observer-a", observerName: "Home listener", id: 2, heardAt: 2, iata: "YKF" },
    { observerId: "observer-b", observerName: "Hill listener", id: 3, heardAt: 3, iata: "YKF" },
  ] } as PacketDetail);
});
afterEach(() => { clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

describe("My Atlas", () => {
  it("does not scan nodes or packets before a search or selection", () => {
    mount();
    expect(screen.getByText("Build your own view of the mesh")).toBeInTheDocument();
    expect(api.getNodesPage).not.toHaveBeenCalled();
    expect(api.getNode).not.toHaveBeenCalled();
    expect(api.getPacketDetail).not.toHaveBeenCalled();
  });
  it("adds a search result once, persists it across visits, and displays its current name", async () => {
    const view = mount();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "repeater" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add Renamed repeater" }));
    expect(await screen.findByRole("article", { name: "Renamed repeater" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renamed repeater is saved" })).toBeDisabled();
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).nodes).toHaveLength(1);
    view.unmount(); mount();
    expect(await screen.findByRole("article", { name: "Renamed repeater" })).toBeInTheDocument();
    expect(api.getNodeObservations).toHaveBeenCalledWith(pin.id, { limit: 200 }, expect.any(AbortSignal));
  });
  it("loads heard-by details only on demand, deduplicates observers and links to the evidence", async () => {
    save(); mount();
    await screen.findByRole("button", { name: "Open node" });
    expect(api.getPacketDetail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Heard by" }));
    expect(await screen.findByText("2 reporting observers")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Home listener" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Home listener" })); expect(actions.onViewObserver).toHaveBeenCalledWith("observer-a");
    fireEvent.click(screen.getByRole("button", { name: "Open packet and observed paths" })); expect(actions.onAnalyzePacket).toHaveBeenCalledWith(report.packetHash, 7);
    fireEvent.click(screen.getByRole("button", { name: "Open node" })); expect(actions.onViewNode).toHaveBeenCalledWith(pin.id);
    expect(screen.getByRole("meter", { name: "Mean SNR: 0 dB" })).toHaveAttribute("aria-valuenow", "0");
  });
  it("keeps only one heard-by section open and saves reordering, removal and the raw-history range", async () => {
    save([pin, second]); mount();
    const first = await screen.findByRole("article", { name: "Renamed repeater" });
    const next = await screen.findByRole("article", { name: "Second" });
    fireEvent.click(within(first).getByRole("button", { name: "Heard by" }));
    fireEvent.click(within(next).getByRole("button", { name: "Heard by" }));
    expect(within(first).getByRole("button", { name: "Heard by" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(within(first).getByText("Manage card"));
    fireEvent.click(within(first).getByRole("button", { name: "Move later" }));
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).nodes[0].publicKey).toBe(second.publicKey);
    fireEvent.click(screen.getByRole("button", { name: "3 days" }));
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).range).toBe("3d");
    fireEvent.click(within(first).getByRole("button", { name: "Remove card" }));
    expect(screen.queryByRole("article", { name: "Renamed repeater" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /7 days|30 days/ })).not.toBeInTheDocument();
  });
  it("uses French labels and keeps working when browser writes fail", async () => {
    save(); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await act(() => i18n.changeLanguage("fr")); mount();
    await screen.findByRole("article", { name: "Renamed repeater" });
    fireEvent.click(screen.getByRole("button", { name: "3 jours" }));
    expect(screen.getByRole("button", { name: "3 jours" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/L’enregistrement dans le navigateur est indisponible/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entendu par" })).toBeInTheDocument();
  });
  it("honours changes made in another tab and keeps corrupt storage from crashing the page", async () => {
    localStorage.setItem(ATLAS_KEY, "{"); mount();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: ATLAS_KEY, newValue: JSON.stringify({ version: 1, nodes: [pin], range: "3d" }) })));
    await screen.findByRole("article", { name: "Renamed repeater" });
    expect(screen.getByRole("button", { name: "3 days" })).toHaveAttribute("aria-pressed", "true");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null })));
    expect(screen.getByText("Build your own view of the mesh")).toBeInTheDocument();
  });
  it("does not query a retained but inactive page", () => {
    save(); mount(false);
    expect(api.getNode).not.toHaveBeenCalled(); expect(api.getNodeObservations).not.toHaveBeenCalled();
  });
  it("explains expired packet evidence", async () => {
    save(); vi.mocked(api.getPacketDetail).mockRejectedValue(new Error("expired")); mount();
    fireEvent.click(await screen.findByRole("button", { name: "Heard by" }));
    await screen.findByText(/The packet details are unavailable or have expired/);
  });
  it("keeps an unavailable node removable without rendering zeros as real readings", async () => {
    save(); vi.mocked(api.getNode).mockRejectedValue(new Error("unavailable")); mount();
    await screen.findByText(/This saved node could not be loaded/);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Manage card"));
    fireEvent.click(screen.getByRole("button", { name: "Remove card" }));
    expect(screen.getByText("Build your own view of the mesh")).toBeInTheDocument();
  });
  it("does not expose observer links for a different full origin identity", async () => {
    save(); vi.mocked(api.getPacketDetail).mockResolvedValue({ originPubkey: second.publicKey, observations: [] } as unknown as PacketDetail); mount();
    fireEvent.click(await screen.findByRole("button", { name: "Heard by" }));
    await screen.findByText(/The packet details are unavailable or have expired/);
    expect(screen.queryByRole("button", { name: "Open packet and observed paths" })).not.toBeInTheDocument();
  });
  it("aborts in-flight requests when leaving the page", () => {
    save(); vi.mocked(api.getNode).mockImplementation(() => new Promise(() => {}));
    const view = mount(); const signal = vi.mocked(api.getNode).mock.calls[0]![1]!;
    expect(signal.aborted).toBe(false);
    view.unmount(); expect(signal.aborted).toBe(true);
  });
  it("shows missing signal values without meters for an empty retained sample", async () => {
    save(); vi.mocked(api.getNodeObservations).mockResolvedValue({ items: [], hasMore: false, nextCursor: null }); mount();
    await screen.findByRole("button", { name: "Open node" });
    expect(screen.getByRole("img", { name: "Mean SNR: Unavailable" })).toBeInTheDocument();
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Heard by" }));
    expect(api.getPacketDetail).not.toHaveBeenCalled();
  });
  it("never queries an invalid public-key search as an unfiltered node list", async () => {
    mount(); fireEvent.click(screen.getByRole("button", { name: /Search.*Name/ }));
    fireEvent.click(screen.getByRole("option", { name: "Public key" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not-a-key" } });
    await act(() => new Promise(resolve => setTimeout(resolve, 350)));
    expect(api.getNodesPage).not.toHaveBeenCalled();
  });
});

describe("identity recovery", () => {
  it("recovers a changed server ID using the exact full public key", async () => {
    vi.mocked(api.getNode).mockRejectedValueOnce(Object.assign(new Error("missing"), { status: 404 }));
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [{ ...node, id: second.id }], nextCursor: null, hasMore: false });
    vi.mocked(api.getNode).mockResolvedValueOnce({ ...node, id: second.id });
    const result = await loadAtlasNode(pin);
    expect(result.node.id).toBe(second.id);
    expect(api.getNodesPage).toHaveBeenCalledWith(undefined, { pubkeyPrefix: pin.publicKey, limit: 2 }, undefined);
  });
  it("does not adopt a mismatched identity or hide transport failures with broad searches", async () => {
    vi.mocked(api.getNode).mockResolvedValueOnce({ ...node, publicKey: second.publicKey });
    vi.mocked(api.getNodesPage).mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false });
    await expect(loadAtlasNode(pin)).rejects.toThrow("Atlas identity unavailable");
    expect(api.getNodeObservations).not.toHaveBeenCalled();
    vi.mocked(api.getNodesPage).mockClear(); vi.mocked(api.getNode).mockRejectedValueOnce(new Error("network"));
    await expect(loadAtlasNode(pin)).rejects.toThrow("network");
    expect(api.getNodesPage).not.toHaveBeenCalled();
  });
});
