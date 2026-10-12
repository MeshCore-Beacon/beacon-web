import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyAtlasPage } from "../../../src/features/atlas/MyAtlasPage";
import { ATLAS_KEY, loadAtlasNode } from "../../../src/features/atlas/atlas";
import * as api from "../../../src/api/client";
import { ApiError } from "../../../src/api/client";
import type { Node } from "../../../src/features/nodes/types";
import { formatHex } from "../../../src/lib/formatters";
import type { PacketDetail } from "../../../src/types/api";
import i18n from "../../../src/i18n";

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getNodesPage: vi.fn(),
  getNode: vi.fn(),
  getNodeObservations: vi.fn(),
  getPacketDetail: vi.fn(),
}));

const pin = { id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "Old name" };
const second = { ...pin, id: "22222222-2222-4222-8222-222222222222", publicKey: "cd".repeat(32), name: "Second" };
const node = { ...pin, name: "Renamed repeater", nodeType: 2, nodeTypeName: "REPEATER", knownNeighborCount: 4, stale: false, lastSeen: Date.now(), iatas: [], lat: null, lng: null } as Node;
const report = { id: 7, packetHash: "ef".repeat(32), payloadType: 4, payloadTypeName: "ADVERT", iata: "YKF", heardAt: Date.now() - 1000, snr: 0, rssi: -106, hopCount: 2 };
const actions = { onViewNode: vi.fn(), onViewObserver: vi.fn(), onAnalyzePacket: vi.fn() };
const clients: QueryClient[] = [];

function mount(active = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><MyAtlasPage {...actions} active={active} /></QueryClientProvider>);
}
function save(nodes = [pin], range = "24h") {
  localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 1, nodes, range }));
}
const typeSearch = (value: string) => fireEvent.change(screen.getByRole("textbox", { name: "Find a node" }), { target: { value } });
const card = (name: string) => screen.findByRole("button", { name }).then((button) => button.closest("[data-atlas-card]") as HTMLElement);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.getNodesPage).mockResolvedValue({ items: [node], hasMore: false, nextCursor: null });
  vi.mocked(api.getNode).mockImplementation(async (id) => (id === second.id ? { ...node, ...second } : node));
  vi.mocked(api.getNodeObservations).mockResolvedValue({ items: [report], hasMore: true, nextCursor: 7 });
  vi.mocked(api.getPacketDetail).mockResolvedValue({ packetHash: report.packetHash, originPubkey: pin.publicKey, header: { payloadType: 4 }, observations: [
    { observerId: "observer-a", observerName: "Home listener", id: 1, heardAt: 1, iata: "YKF" },
  ] } as unknown as PacketDetail);
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("My Atlas", () => {
  it("renders saved nodes as Signal-style cards and nothing else before a search", async () => {
    save();
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(screen.getByText("Observations")).toBeInTheDocument();
    expect(screen.getByText("1 / 12 saved")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Activity window" })).toBeInTheDocument();
    expect(api.getNodesPage).not.toHaveBeenCalled();
    expect(api.getPacketDetail).not.toHaveBeenCalled();
    expect(api.getNodeObservations).toHaveBeenCalledWith(pin.id, { limit: 200 }, expect.any(AbortSignal));
  });

  it("shows the empty state and queries nothing with no pins", () => {
    mount();
    expect(screen.getByText("No nodes saved")).toBeInTheDocument();
    expect(api.getNode).not.toHaveBeenCalled();
    expect(api.getNodesPage).not.toHaveBeenCalled();
  });

  it("adds a search result once, persists it and shows its current name", async () => {
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [node], hasMore: true, nextCursor: null });
    const view = mount();
    typeSearch("repeater");
    fireEvent.click(await screen.findByRole("button", { name: "Add Renamed repeater" }));
    expect(await screen.findByRole("button", { name: "Renamed repeater" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renamed repeater is saved" })).toBeDisabled();
    expect(screen.getByText("Showing the first 8 matches; refine the search for more.")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).nodes).toHaveLength(1);
    expect(api.getNodesPage).toHaveBeenCalledWith(undefined, { name: "repeater", limit: 8 }, expect.any(AbortSignal));
    view.unmount();
    mount();
    expect(await screen.findByRole("button", { name: "Renamed repeater" })).toBeInTheDocument();
  });

  it("tells two results with the same name and type apart by their key prefix", async () => {
    const twin = { ...node, id: second.id, publicKey: second.publicKey };
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [node, twin], hasMore: false, nextCursor: null });
    mount();
    typeSearch("repeater");
    expect(await screen.findAllByRole("button", { name: "Add Renamed repeater" })).toHaveLength(2);
    expect(screen.getByText(formatHex(pin.publicKey))).toBeInTheDocument();
    expect(screen.getByText(formatHex(second.publicKey))).toBeInTheDocument();
  });

  it("explains why a short or non-hex search shows nothing", async () => {
    mount();
    expect(screen.getByText(/More information:.*hex, at least 2 characters/)).toBeInTheDocument();
    typeSearch("r");
    expect(await screen.findByText("Type at least 2 characters.")).toBeInTheDocument();
    expect(api.getNodesPage).not.toHaveBeenCalled();
  });

  it("never sends a non-hex public-key search", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    fireEvent.click(screen.getByRole("button", { name: "Public Key" }));
    typeSearch("not-a-key");
    expect(await screen.findByText("A public key prefix is hex only (0-9, a-f).")).toBeInTheDocument();
    expect(api.getNodesPage).not.toHaveBeenCalled();
    typeSearch("abcd");
    await screen.findByRole("button", { name: "Add Renamed repeater" });
    expect(api.getNodesPage).toHaveBeenCalledWith(undefined, { pubkeyPrefix: "abcd", limit: 8 }, expect.any(AbortSignal));
  });

  it("clears the box when the search field changes, as the Nodes table does", async () => {
    mount();
    typeSearch("repeater");
    await screen.findByRole("button", { name: "Add Renamed repeater" });
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    fireEvent.click(screen.getByRole("button", { name: "Public Key" }));
    expect(screen.getByRole("textbox", { name: "Find a node" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Add Renamed repeater" })).not.toBeInTheDocument();
  });

  it("refuses a thirteenth pin from the UI", async () => {
    const pins = Array.from({ length: 12 }, (_, i) => ({ ...pin, id: `${i.toString().padStart(8, "0")}-1111-4111-8111-111111111111`, publicKey: i.toString(16).padStart(64, "0") }));
    save(pins);
    mount();
    expect(await screen.findByText("12 / 12 saved")).toBeInTheDocument();
    typeSearch("repeater");
    // twelve cards mount before the debounced search resolves; allow for a loaded suite
    expect(await screen.findByRole("button", { name: "Add Renamed repeater" }, { timeout: 4000 })).toBeDisabled();
    expect(screen.getByText(/All 12 slots are in use/)).toBeInTheDocument();
  });

  it("keeps one heard-by open, saves reordering, removal and the range", async () => {
    save([pin, second]);
    mount();
    const first = await card("Renamed repeater");
    const next = await card("Second");
    fireEvent.click(within(first).getByRole("button", { name: "Heard by" }));
    fireEvent.click(within(next).getByRole("button", { name: "Heard by" }));
    expect(within(first).getByRole("button", { name: "Heard by" })).toHaveAttribute("aria-pressed", "false");
    expect(within(next).getByRole("button", { name: "Analytics" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(within(first).getByRole("button", { name: "Drag to reorder" }), { key: "ArrowRight" });
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).nodes[0].publicKey).toBe(second.publicKey);
    fireEvent.click(screen.getByRole("button", { name: "3d" }));
    expect(screen.getByRole("button", { name: "3d" })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).range).toBe("3d");
    fireEvent.click(within(first).getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("button", { name: "Renamed repeater" })).not.toBeInTheDocument();
  });

  it("uses French labels and keeps working when browser writes fail", async () => {
    const store = new Map<string, string>([[ATLAS_KEY, JSON.stringify({ version: 1, nodes: [pin], range: "24h" })]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: () => { throw new Error("quota"); },
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    });
    await act(() => i18n.changeLanguage("fr"));
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    fireEvent.click(screen.getByRole("button", { name: "3 j" }));
    expect(screen.getByRole("button", { name: "3 j" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Le stockage du navigateur est indisponible/)).toBeInTheDocument();
    expect(screen.getByText("1 / 12 enregistré")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entendu par" })).toBeInTheDocument();
  });

  it("honours changes made in another tab and survives corrupt storage", async () => {
    localStorage.setItem(ATLAS_KEY, "{");
    mount();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: ATLAS_KEY, newValue: JSON.stringify({ version: 1, nodes: [pin], range: "3d" }) })));
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(screen.getByRole("button", { name: "3d" })).toHaveAttribute("aria-pressed", "true");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null })));
    expect(screen.getByText("No nodes saved")).toBeInTheDocument();
  });

  it("does not query a retained but inactive page", () => {
    save();
    mount(false);
    expect(api.getNode).not.toHaveBeenCalled();
    expect(api.getNodeObservations).not.toHaveBeenCalled();
  });

  it("aborts in-flight requests when leaving the page", () => {
    save();
    vi.mocked(api.getNode).mockImplementation(() => new Promise(() => {}));
    const view = mount();
    const signal = vi.mocked(api.getNode).mock.calls[0]![1]!;
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});

describe("identity recovery", () => {
  it("recovers a changed server ID using the exact full public key", async () => {
    vi.mocked(api.getNode).mockRejectedValueOnce(new ApiError(404, "not_found", "missing"));
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [{ ...node, id: second.id }], nextCursor: null, hasMore: false });
    vi.mocked(api.getNode).mockResolvedValueOnce({ ...node, id: second.id });
    const result = await loadAtlasNode(pin);
    expect(result.node.id).toBe(second.id);
    expect(api.getNodesPage).toHaveBeenCalledWith(undefined, { pubkeyPrefix: pin.publicKey, limit: 2 }, undefined);
  });
  it("writes a recovered server ID back so later polls skip the lookup", async () => {
    vi.mocked(api.getNode).mockImplementation(async (id) => {
      if (id === pin.id) throw new ApiError(404, "not_found", "missing");
      return { ...node, id: second.id };
    });
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [{ ...node, id: second.id }], nextCursor: null, hasMore: false });
    save();
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).nodes[0].id).toBe(second.id));
  });
  it("does not adopt a mismatched identity or hide transport failures with broad searches", async () => {
    vi.mocked(api.getNode).mockResolvedValueOnce({ ...node, publicKey: second.publicKey });
    vi.mocked(api.getNodesPage).mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false });
    await expect(loadAtlasNode(pin)).rejects.toMatchObject({ message: "Atlas identity unavailable", status: 404 });
    expect(api.getNodeObservations).not.toHaveBeenCalled();
    vi.mocked(api.getNodesPage).mockClear(); vi.mocked(api.getNode).mockRejectedValueOnce(new Error("network"));
    await expect(loadAtlasNode(pin)).rejects.toThrow("network");
    expect(api.getNodesPage).not.toHaveBeenCalled();
  });
});
