import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AtlasPage } from "../../../src/features/atlas/AtlasPage";
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
  getNodeActivity: vi.fn(),
  getPacketDetail: vi.fn(),
  getObserverDirectoryPage: vi.fn(),
  getObserver: vi.fn(),
  getObserverActivity: vi.fn(),
  getObserverTelemetry: vi.fn(),
  getServerInfo: vi.fn(),
}));

const pin = { id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "Old name" };
const second = { ...pin, id: "22222222-2222-4222-8222-222222222222", publicKey: "cd".repeat(32), name: "Second" };
const node = { ...pin, name: "Renamed repeater", nodeType: 2, nodeTypeName: "REPEATER", knownNeighborCount: 4, stale: false, lastSeen: Date.now(), iatas: [], lat: null, lng: null } as Node;
const report = { packetHash: "ef".repeat(32), heardAt: Date.now() - 1000 };
const activity = { windowStart: 0, windowEnd: 0, generatedAt: 0, range: "24h", summary: { observations: 1, snrAvg: 0, rssiAvg: -106, hopAvg: 2 }, points: [], latest: report };
const actions = { onViewNode: vi.fn(), onViewObserver: vi.fn(), onAnalyzePacket: vi.fn() };
const observerId = "33333333-3333-4333-8333-333333333333";
const listener = { id: observerId, displayName: "Hill listener", observerType: "companion", iata: "YKF", status: "online", observationCount: 7 };
const directory = (items: unknown[]) => ({ items, hasMore: false, generatedAt: 0, windowStart: 0, windowEnd: 0, sort: "name", effectiveSort: "name", coverage: { status: "complete", expectedHours: 24, completeHours: 24, missingHours: 0, partialHours: 0 }, maxObservationCount: 7, observerTypes: [] }) as never;
const pickField = async (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: /Name|Public Key|Observer/ }));
  fireEvent.click(await screen.findByRole("button", { name: label }));
};
const clients: QueryClient[] = [];

function mount(active = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AtlasPage {...actions} active={active} /></QueryClientProvider>);
}
function save(nodes = [pin], range = "24h") {
  localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 2, pins: nodes.map((n) => ({ kind: "node", ...n })), range }));
}
const typeSearch = (value: string) => fireEvent.change(screen.getByRole("textbox", { name: "Find a node" }), { target: { value } });
const card = (name: string) => screen.findByRole("button", { name }).then((button) => button.closest("[data-atlas-card]") as HTMLElement);

beforeEach(() => {
  vi.mocked(api.getServerInfo).mockResolvedValue({ minAppVersion: null, minWebVersion: null, serverVersion: "2.3.0" });
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.getNodesPage).mockResolvedValue({ items: [node], hasMore: false, nextCursor: null });
  vi.mocked(api.getNode).mockImplementation(async (id) => (id === second.id ? { ...node, ...second } : node));
  vi.mocked(api.getNodeActivity).mockResolvedValue(activity);
  vi.mocked(api.getPacketDetail).mockResolvedValue({ packetHash: report.packetHash, originPubkey: pin.publicKey, header: { payloadType: 4 }, observations: [
    { observerId: "observer-a", observerName: "Home listener", id: 1, heardAt: 1, iata: "YKF" },
  ] } as unknown as PacketDetail);
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Atlas page", () => {
  it("renders saved nodes as Signal-style cards and nothing else before a search", async () => {
    save();
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(screen.getByText("Observations")).toBeInTheDocument();
    expect(screen.getByText("1 / 12 saved")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Activity window" })).toBeInTheDocument();
    expect(api.getNodesPage).not.toHaveBeenCalled();
    expect(api.getPacketDetail).not.toHaveBeenCalled();
    await waitFor(() => expect(api.getNodeActivity).toHaveBeenCalledWith(pin.id, "24h", expect.any(AbortSignal)));
  });

  it("keeps the search in a toolbar with the saved count chip beside the range picker, and lists matches only while typing", async () => {
    save();
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    const bar = screen.getByRole("toolbar", { name: "Add nodes" });
    expect(within(bar).getByRole("textbox", { name: "Find a node" })).toBeInTheDocument();
    expect(within(bar).getByText("1 / 12 saved")).toHaveClass("rounded-sm");
    expect(within(bar).getByRole("button", { name: "3d" })).toBeInTheDocument();
    expect(screen.queryByText("Matches")).not.toBeInTheDocument();
    typeSearch("repeater");
    expect(await screen.findByRole("button", { name: "Renamed repeater is saved" })).toBeInTheDocument();
    expect(screen.getByText("Matches")).toBeInTheDocument();
  });

  describe("7d range", () => {
    const withFlag = (atlas7d: boolean) => vi.mocked(api.getServerInfo).mockResolvedValue({ minAppVersion: null, minWebVersion: null, serverVersion: "2.4.0", features: { atlas7d } } as never);

    it("is not offered by a server without atlas7d", async () => {
      save();
      mount();
      await screen.findByRole("button", { name: "Renamed repeater" });
      await waitFor(() => expect(api.getServerInfo).toHaveBeenCalled());
      const picker = screen.getByRole("group", { name: "Activity window" });
      expect(within(picker).getAllByRole("button").map((b) => b.textContent)).toEqual(["24h", "3d"]);
    });

    it("is offered with atlas7d, saved, and read as 168h", async () => {
      withFlag(true);
      save();
      mount();
      await screen.findByRole("button", { name: "Renamed repeater" });
      fireEvent.click(await screen.findByRole("button", { name: "7d" }));
      expect(screen.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
      expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).range).toBe("7d");
      await waitFor(() => expect(api.getNodeActivity).toHaveBeenCalledWith(pin.id, "168h", expect.any(AbortSignal)));
    });

    it("shows and reads a saved 7d as 3d on a server without it, leaving the saved 7d alone", async () => {
      withFlag(false);
      save([pin], "7d");
      mount();
      await screen.findByRole("button", { name: "Renamed repeater" });
      await waitFor(() => expect(api.getNodeActivity).toHaveBeenCalledWith(pin.id, "72h", expect.any(AbortSignal)));
      expect(api.getNodeActivity).not.toHaveBeenCalledWith(pin.id, "168h", expect.anything());
      expect(screen.getByRole("button", { name: "3d" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByRole("button", { name: "7d" })).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).range).toBe("7d");
    });

    it("waits for /info before loading a saved 7d, so it never loads as 3d first", async () => {
      let answer: (value: unknown) => void = () => {};
      vi.mocked(api.getServerInfo).mockReturnValue(new Promise((resolve) => { answer = resolve; }) as never);
      save([pin], "7d");
      mount();
      expect(screen.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(api.getNode).not.toHaveBeenCalled();
      expect(api.getNodeActivity).not.toHaveBeenCalled();
      await act(async () => { answer({ features: { atlas7d: true } }); });
      await waitFor(() => expect(api.getNodeActivity).toHaveBeenCalledWith(pin.id, "168h", expect.any(AbortSignal)));
      expect(api.getNodeActivity).not.toHaveBeenCalledWith(pin.id, "72h", expect.anything());
    });
  });

  it("keeps the toolbar to one row on a phone: short count chip, picker, no info tip", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: /767px/.test(query), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    save();
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    const bar = screen.getByRole("toolbar", { name: "Add nodes" });
    expect(bar).not.toHaveClass("flex-wrap");
    expect(bar.querySelector("[data-toolbar-search]")).not.toHaveClass("w-full");
    expect(within(bar).getByText("1/12")).toHaveClass("rounded-sm");
    expect(within(bar).queryByText("1 / 12 saved")).not.toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "3d" })).toBeInTheDocument();
    expect(within(bar).queryByText(/More information/)).not.toBeInTheDocument();
  });

  it("gives the search its own row under 360 px, with the edit button at the far end below", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: /max-width/.test(query), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
    save();
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    const bar = screen.getByRole("toolbar", { name: "Add nodes" });
    expect(bar).toHaveClass("flex-wrap");
    expect(bar.querySelector("[data-toolbar-search]")).toHaveClass("w-full");
    const controls = bar.querySelector("[data-toolbar-controls]")!;
    expect(controls).toHaveClass("w-full");
    expect(within(bar).getByRole("button", { name: "Edit cards" }).closest("[data-toolbar-edit]")).toHaveClass("ml-auto");
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
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).pins).toHaveLength(1);
    expect(api.getNodesPage).toHaveBeenCalledWith(undefined, { name: "repeater", limit: 8 }, expect.any(AbortSignal));
    view.unmount();
    mount();
    expect(await screen.findByRole("button", { name: "Renamed repeater" })).toBeInTheDocument();
  });

  it("badges a poller result with both Observer and Poller, and a plain one with neither", async () => {
    const plain = { ...node, id: second.id, publicKey: second.publicKey, name: "Plain node" };
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [{ ...node, isObserver: true, isPoller: true }, plain], hasMore: false, nextCursor: null });
    mount();
    typeSearch("node");
    const row = (await screen.findByRole("button", { name: "Add Renamed repeater" })).closest("li")!;
    expect(within(row).getByText("Observer")).toBeInTheDocument();
    expect(within(row).getByText("Poller")).toBeInTheDocument();
    const plainRow = screen.getByRole("button", { name: "Add Plain node" }).closest("li")!;
    expect(within(plainRow).queryByText("Poller")).not.toBeInTheDocument();
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

  it("takes its cap from the server", async () => {
    vi.mocked(api.getServerInfo).mockResolvedValue({ minAppVersion: null, minWebVersion: null, serverVersion: "2.3.0", limits: { atlas: 2 } });
    save(Array.from({ length: 2 }, (_, i) => ({ ...pin, id: `${i.toString().padStart(8, "0")}-1111-4111-8111-111111111111`, publicKey: i.toString(16).padStart(64, "0") })));
    mount();
    expect(await screen.findByText("2 / 2 saved")).toBeInTheDocument();
    typeSearch("repeater");
    expect(await screen.findByRole("button", { name: "Add Renamed repeater" }, { timeout: 4000 })).toBeDisabled();
    expect(screen.getByText(/All 2 slots are in use/)).toBeInTheDocument();
  });

  it("keeps cards over a lowered cap and takes no more", async () => {
    vi.mocked(api.getServerInfo).mockResolvedValue({ minAppVersion: null, minWebVersion: null, serverVersion: "2.3.0", limits: { atlas: 1 } });
    save([pin, second]);
    mount();
    expect(await screen.findByText("2 / 1 saved")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Edit cards" }));
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
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

  it("keeps Unicode names on existing nodes and newly appended observers", async () => {
    const nodeName = "\u{1f600}".repeat(160);
    const observerName = "A".repeat(159) + "\u{1f600}";
    save([{ ...pin, name: nodeName }]);
    const namedListener = { ...listener, displayName: observerName };
    vi.mocked(api.getObserverDirectoryPage).mockResolvedValue(directory([namedListener]));
    vi.mocked(api.getObserver).mockResolvedValue({ ...namedListener, publicKey: "" } as never);
    mount();
    await pickField("Observer");
    typeSearch("listener");
    fireEvent.click(await screen.findByRole("button", { name: `Add ${observerName}` }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).pins).toEqual([
      { kind: "node", ...pin, name: nodeName },
      { kind: "observer", observerId, name: observerName },
    ]));
  });

  it("searches observers by name and saves a node pin when the observer's key belongs to a node", async () => {
    vi.mocked(api.getObserverDirectoryPage).mockResolvedValue(directory([listener]));
    vi.mocked(api.getObserver).mockResolvedValue({ ...listener, publicKey: pin.publicKey } as never);
    mount();
    await pickField("Observer");
    typeSearch("hill");
    expect(await screen.findByText("Hill listener")).toBeInTheDocument();
    expect(api.getObserverDirectoryPage).toHaveBeenCalledWith({ name: "hill", limit: 8 }, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Add Hill listener" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).pins).toEqual([{ kind: "node", id: pin.id, publicKey: pin.publicKey, name: "Renamed repeater", observerId }]));
    expect(screen.getByRole("button", { name: "Hill listener is saved" })).toBeDisabled();
  });

  it("saves an observer-only pin when no node has the observer's key, and marks it saved by id", async () => {
    vi.mocked(api.getObserverDirectoryPage).mockResolvedValue(directory([listener]));
    vi.mocked(api.getObserver).mockResolvedValue({ ...listener, publicKey: "" } as never);
    mount();
    await pickField("Observer");
    typeSearch("hill");
    fireEvent.click(await screen.findByRole("button", { name: "Add Hill listener" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).pins).toEqual([{ kind: "observer", observerId, name: "Hill listener" }]));
    expect(await screen.findByRole("button", { name: "Hill listener is saved" })).toBeDisabled();
  });

  it("links an observer result to an already pinned node instead of adding a twin", async () => {
    vi.mocked(api.getObserverDirectoryPage).mockResolvedValue(directory([listener]));
    vi.mocked(api.getObserver).mockResolvedValue({ ...listener, publicKey: pin.publicKey } as never);
    save([pin]);
    mount();
    await pickField("Observer");
    typeSearch("hill");
    fireEvent.click(await screen.findByRole("button", { name: "Add Hill listener" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).pins).toEqual([{ kind: "node", ...pin, observerId }]));
    expect(screen.getByRole("button", { name: "Hill listener is saved" })).toBeDisabled();
  });

  it("folds an observer pin into the already pinned node and keeps its link", async () => {
    vi.mocked(api.getObserver).mockResolvedValue({ ...listener, publicKey: pin.publicKey } as never);
    localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 2, range: "24h", pins: [{ kind: "node", ...pin }, { kind: "observer", observerId, name: "Hill listener" }] }));
    mount();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).pins).toEqual([{ kind: "node", ...pin, observerId }]));
  });

  it("clears a failed observer add once the search changes", async () => {
    vi.mocked(api.getObserverDirectoryPage).mockResolvedValue(directory([listener]));
    vi.mocked(api.getObserver).mockRejectedValue(new ApiError(500, "boom", "boom"));
    mount();
    await pickField("Observer");
    typeSearch("hill");
    fireEvent.click(await screen.findByRole("button", { name: "Add Hill listener" }));
    expect(await screen.findByText("Failed to load")).toBeInTheDocument();
    typeSearch("hil");
    await waitFor(() => expect(screen.queryByText("Failed to load")).not.toBeInTheDocument());
  });

  describe("export and import", () => {
    const file = (pins: unknown[]) => new File([JSON.stringify({ format: "beacon-atlas", version: 2, range: "3d", pins })], "atlas.json", { type: "application/json" });
    const choose = async (value: File) => {
      await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).toBeEnabled());
      fireEvent.change(screen.getByLabelText("Atlas file to import"), { target: { files: [value] } });
    };
    const stored = () => JSON.parse(localStorage.getItem(ATLAS_KEY)!);

    const importedPins = Array.from({ length: 20 }, (_, i) => ({
      kind: "node", id: `${String(i + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
      publicKey: i.toString(16).padStart(64, "0"), name: `Fixture ${i + 1}`,
    }));

    it.each([2, 20])("waits for initial metadata before importing with server limit %i", async (limit) => {
      let finish!: (info: Awaited<ReturnType<typeof api.getServerInfo>>) => void;
      vi.mocked(api.getServerInfo).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      mount();
      const button = screen.getByRole("button", { name: "Import" });
      expect(button).toBeDisabled();
      expect(screen.getByLabelText("Atlas file to import")).toBeDisabled();
      // A forced change event must not bypass the disabled picker.
      await act(async () => { fireEvent.change(screen.getByLabelText("Atlas file to import"), { target: { files: [file(importedPins)] } }); });
      expect(JSON.parse(localStorage.getItem(ATLAS_KEY) ?? '{"pins":[]}').pins).toEqual([]);
      await act(async () => { finish({ minAppVersion: null, minWebVersion: null, serverVersion: "2.3.0", limits: { atlas: limit } }); });
      await waitFor(() => expect(button).toBeEnabled());
      await choose(file(importedPins));
      await waitFor(() => expect(stored().pins).toEqual(importedPins.slice(0, limit)));
      expect(screen.getByText(new RegExp(`Imported ${limit} cards`))).toBeInTheDocument();
    });

    it.each(["old server", "failed metadata"])("keeps the compatibility fallback after %s settles", async (kind) => {
      if (kind === "failed metadata") vi.mocked(api.getServerInfo).mockRejectedValue(new Error("offline"));
      mount();
      await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).toBeEnabled());
      await choose(file(importedPins));
      await waitFor(() => expect(stored().pins).toEqual(importedPins.slice(0, 12)));
      expect(screen.getByText("Imported 12 cards. 8 entries skipped (duplicate, invalid or over the limit).")).toBeInTheDocument();
    });

    it("keeps import unavailable while initial metadata is paused offline", async () => {
      onlineManager.setOnline(false);
      const view = mount();
      try {
        expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
        await act(async () => { fireEvent.change(screen.getByLabelText("Atlas file to import"), { target: { files: [file(importedPins)] } }); });
        expect(api.getServerInfo).not.toHaveBeenCalled();
        expect(JSON.parse(localStorage.getItem(ATLAS_KEY) ?? '{"pins":[]}').pins).toEqual([]);
      } finally {
        view.unmount();
        onlineManager.setOnline(true);
      }
    });

    it("downloads the saved Atlas as a dated file, and has nothing to export when empty", async () => {
      const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:atlas");
      vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      save([pin, second]);
      mount();
      fireEvent.click(screen.getByRole("button", { name: "Export" }));
      expect(click).toHaveBeenCalledTimes(1);
      expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toMatch(/^beacon-atlas-\d{4}-\d{2}-\d{2}\.json$/);
      const exported = JSON.parse(await createObjectURL.mock.calls[0]![0].text());
      expect(exported).toMatchObject({ format: "beacon-atlas", range: "24h", pins: [{ kind: "node", ...pin }, { kind: "node", ...second }] });
      localStorage.clear();
    });

    it("loads a file straight into an empty Atlas", async () => {
      mount();
      expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
      await choose(file([{ kind: "node", ...pin }]));
      expect(await screen.findByText("Imported 1 card.")).toBeInTheDocument();
      expect(stored()).toEqual({ version: 2, range: "3d", pins: [{ kind: "node", ...pin }] });
    });

    it("asks before replacing saved cards, and keeps them on Cancel", async () => {
      save([pin]);
      mount();
      await choose(file([{ kind: "node", ...second }, { kind: "node", id: "bad" }]));
      const prompt = await screen.findByRole("alertdialog", { name: "Replace your Atlas?" });
      expect(prompt).toHaveTextContent("Replace your 1 saved card with the 1 in this file?");
      fireEvent.click(within(prompt).getByRole("button", { name: "Cancel" }));
      expect(stored().pins).toEqual([{ kind: "node", ...pin }]);
      await choose(file([{ kind: "node", ...second }, { kind: "node", id: "bad" }]));
      fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Replace" }));
      expect(stored().pins).toEqual([{ kind: "node", ...second }]);
      expect(screen.getByText("Imported 1 card. 1 entry skipped (duplicate, invalid or over the limit).")).toBeInTheDocument();
    });

    it("refuses a file that is not an Atlas export without touching saved cards", async () => {
      save([pin]);
      mount();
      await choose(new File(["{\"version\":2,\"pins\":[]}"], "other.json"));
      expect(await screen.findByText(/not a Beacon Atlas export/)).toBeInTheDocument();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(stored().pins).toEqual([{ kind: "node", ...pin }]);
    });
  });

  describe("pinned card view", () => {
    const stored = () => JSON.parse(localStorage.getItem(ATLAS_KEY)!);
    const seed = (pins: unknown[]) => localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 2, range: "24h", pins }));
    const tab = (within_: HTMLElement, name: string) => within(within_).getByRole("button", { name });
    const toggle = (within_: HTMLElement) => within(within_).getByRole("button", { name: "Open on this tab" });
    beforeEach(() => {
      vi.mocked(api.getObserver).mockResolvedValue({ ...listener, publicKey: pin.publicKey } as never);
      vi.mocked(api.getObserverActivity).mockResolvedValue({ range: "24h", interval: "1h", radio: null, payloadTypes: [], points: [] });
      vi.mocked(api.getObserverTelemetry).mockResolvedValue({ range: "24h", interval: "1h", points: [] });
    });

    it("opens a card on its pinned view, loading the observer series for a card pinned to Observer", async () => {
      seed([{ kind: "node", ...pin, observerId, view: "observer" }, { kind: "node", ...second, view: "heard" }]);
      mount();
      const first = await card("Renamed repeater");
      expect(tab(first, "Observer")).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(await screen.findByRole("button", { name: "Edit cards" }));
      expect(toggle(first)).toHaveAttribute("aria-pressed", "true");
      await waitFor(() => expect(api.getObserverActivity).toHaveBeenCalled());
      expect(tab(await card("Second"), "Heard by")).toHaveAttribute("aria-pressed", "true");
    });

    it("falls back to Analytics while the pinned view does not apply, and keeps the saved value", async () => {
      seed([{ kind: "node", ...pin, view: "observer" }]);
      mount();
      const first = await card("Renamed repeater");
      expect(tab(first, "Analytics")).toHaveAttribute("aria-pressed", "true");
      expect(within(first).queryByRole("button", { name: "Observer" })).not.toBeInTheDocument();
      expect(stored().pins[0].view).toBe("observer");
      expect(api.getObserverActivity).not.toHaveBeenCalled();
    });

    it("pins the tab being looked at, and a look at another tab leaves the saved view alone", async () => {
      seed([{ kind: "node", ...pin }]);
      const view = mount();
      const first = await card("Renamed repeater");
      fireEvent.click(tab(first, "Heard by"));
      expect("view" in stored().pins[0]).toBe(false);
      fireEvent.click(await screen.findByRole("button", { name: "Edit cards" }));
      expect(toggle(first)).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(toggle(first));
      expect(stored().pins).toEqual([{ kind: "node", ...pin, view: "heard" }]);
      expect(toggle(first)).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(tab(first, "Analytics"));
      expect(stored().pins[0].view).toBe("heard");
      view.unmount();
      mount();
      expect(tab(await card("Renamed repeater"), "Heard by")).toHaveAttribute("aria-pressed", "true");
    });

    it("drops the field when Analytics is pinned again", async () => {
      seed([{ kind: "node", ...pin, view: "heard" }]);
      mount();
      const first = await card("Renamed repeater");
      fireEvent.click(tab(first, "Analytics"));
      fireEvent.click(await screen.findByRole("button", { name: "Edit cards" }));
      fireEvent.click(toggle(first));
      expect(stored().pins).toEqual([{ kind: "node", ...pin }]);
    });

    it("leaves a card on the view it was switched to when another card switches", async () => {
      seed([{ kind: "node", ...pin, view: "heard" }, { kind: "node", ...second }]);
      mount();
      const first = await card("Renamed repeater");
      const other = await card("Second");
      fireEvent.click(tab(first, "Analytics"));
      fireEvent.click(tab(other, "Heard by"));
      expect(tab(first, "Analytics")).toHaveAttribute("aria-pressed", "true");
      expect(tab(other, "Heard by")).toHaveAttribute("aria-pressed", "true");
      expect(stored().pins.map((p: { view?: string }) => p.view)).toEqual(["heard", undefined]);
    });

    it("keeps the view through a relink and an add from search", async () => {
      vi.mocked(api.getNode).mockImplementation(async () => ({ ...node, id: second.id, observerId }));
      seed([{ kind: "node", ...pin, view: "heard" }]);
      mount();
      await waitFor(() => expect(stored().pins).toEqual([{ kind: "node", ...pin, id: second.id, observerId, view: "heard" }]));
      vi.mocked(api.getNodesPage).mockResolvedValue({ items: [{ ...node, ...second, id: "55555555-5555-4555-8555-555555555555" }], hasMore: false, nextCursor: null });
      typeSearch("second");
      fireEvent.click(await screen.findByRole("button", { name: "Add Second" }));
      await waitFor(() => expect(stored().pins).toHaveLength(2));
      expect(stored().pins[0].view).toBe("heard");
      expect("view" in stored().pins[1]).toBe(false);
    });

    it("opens an upgraded observer pin on Observer, and leaves a node pin it folds into alone", async () => {
      seed([{ kind: "observer", observerId, name: "Hill listener" }]);
      const first = mount();
      await waitFor(() => expect(stored().pins).toEqual([{ kind: "node", id: pin.id, publicKey: pin.publicKey, name: "Renamed repeater", observerId, view: "observer" }]));
      expect(tab(await card("Renamed repeater"), "Observer")).toHaveAttribute("aria-pressed", "true");
      first.unmount();
      seed([{ kind: "node", ...pin, view: "heard" }, { kind: "observer", observerId, name: "Hill listener" }]);
      mount();
      await waitFor(() => expect(stored().pins).toEqual([{ kind: "node", ...pin, view: "heard", observerId }]));
    });

    it("exports the view and reads it back on import", async () => {
      const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:atlas");
      vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      seed([{ kind: "node", ...pin, view: "heard" }]);
      const first = mount();
      fireEvent.click(screen.getByRole("button", { name: "Export" }));
      const text = await createObjectURL.mock.calls[0]![0].text();
      expect(JSON.parse(text).pins).toEqual([{ kind: "node", ...pin, view: "heard" }]);
      first.unmount();
      localStorage.clear();
      mount();
      await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).toBeEnabled());
      fireEvent.change(screen.getByLabelText("Atlas file to import"), { target: { files: [new File([text], "atlas.json", { type: "application/json" })] } });
      expect(await screen.findByText("Imported 1 card.")).toBeInTheDocument();
      expect(stored().pins).toEqual([{ kind: "node", ...pin, view: "heard" }]);
      expect(tab(await card("Renamed repeater"), "Heard by")).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("observer view tiles", () => {
    const tiles = ["snr", "battery", "types", "noise"];
    const observerPin = { kind: "observer", observerId, name: "Hill listener" };
    const stored = () => JSON.parse(localStorage.getItem(ATLAS_KEY)!);
    const seed = (pins: unknown[]) => localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 2, range: "24h", pins }));
    beforeEach(() => {
      vi.mocked(api.getObserver).mockResolvedValue({ ...listener, publicKey: "" } as never);
      vi.mocked(api.getObserverActivity).mockResolvedValue({ range: "24h", interval: "1h", radio: null, payloadTypes: [], points: [] });
      vi.mocked(api.getObserverTelemetry).mockResolvedValue({ range: "24h", interval: "1h", points: [] });
    });

    it("saves a swapped tile on its pin only, and drops the field again on reset", async () => {
      seed([observerPin, { kind: "node", ...pin }]);
      mount();
      fireEvent.click(await screen.findByRole("button", { name: "Change tile: Airtime" }));
      fireEvent.click(screen.getByRole("option", { name: "Mean SNR" }));
      expect(stored().pins).toEqual([{ ...observerPin, tiles }, { kind: "node", ...pin }]);
      fireEvent.click(await screen.findByRole("button", { name: "Change tile: Mean SNR" }));
      fireEvent.click(screen.getByRole("button", { name: "Reset tiles" }));
      expect(stored().pins).toEqual([observerPin, { kind: "node", ...pin }]);
    });

    it("keeps the tiles when an observer pin is upgraded to a node pin", async () => {
      vi.mocked(api.getObserver).mockResolvedValue({ ...listener, publicKey: pin.publicKey } as never);
      seed([{ ...observerPin, tiles }]);
      mount();
      await waitFor(() => expect(stored().pins).toEqual([{ kind: "node", id: pin.id, publicKey: pin.publicKey, name: "Renamed repeater", observerId, tiles, view: "observer" }]));
    });

    it("hands an observer pin's tiles to the node pin it folds into, unless that pin has its own", async () => {
      vi.mocked(api.getObserver).mockResolvedValue({ ...listener, publicKey: pin.publicKey } as never);
      seed([{ kind: "node", ...pin }, { ...observerPin, tiles }]);
      const first = mount();
      await waitFor(() => expect(stored().pins).toEqual([{ kind: "node", ...pin, observerId, tiles }]));
      first.unmount();
      const own = ["queue", "battery", "types", "noise"];
      seed([{ kind: "node", ...pin, tiles: own }, { ...observerPin, tiles }]);
      mount();
      await waitFor(() => expect(stored().pins).toEqual([{ kind: "node", ...pin, tiles: own, observerId }]));
    });

    it("keeps the tiles through a relink, an add from search and a reorder", async () => {
      vi.mocked(api.getNode).mockImplementation(async () => ({ ...node, id: second.id, observerId }));
      seed([{ kind: "node", ...pin, tiles }]);
      mount();
      await waitFor(() => expect(stored().pins).toEqual([{ kind: "node", ...pin, id: second.id, observerId, tiles }]));
      vi.mocked(api.getNodesPage).mockResolvedValue({ items: [{ ...node, ...second, id: "55555555-5555-4555-8555-555555555555" }], hasMore: false, nextCursor: null });
      typeSearch("second");
      fireEvent.click(await screen.findByRole("button", { name: "Add Second" }));
      await waitFor(() => expect(stored().pins).toHaveLength(2));
      expect(stored().pins[0].tiles).toEqual(tiles);
      expect("tiles" in stored().pins[1]).toBe(false);
    });

    it("exports the tiles and reads them back on import", async () => {
      const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:atlas");
      vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      seed([{ ...observerPin, tiles }, { kind: "node", ...pin }]);
      const first = mount();
      fireEvent.click(screen.getByRole("button", { name: "Export" }));
      const text = await createObjectURL.mock.calls[0]![0].text();
      expect(JSON.parse(text).pins).toEqual([{ ...observerPin, tiles }, { kind: "node", ...pin }]);
      first.unmount();
      localStorage.clear();
      mount();
      await waitFor(() => expect(screen.getByRole("button", { name: "Import" })).toBeEnabled());
      fireEvent.change(screen.getByLabelText("Atlas file to import"), { target: { files: [new File([text], "atlas.json", { type: "application/json" })] } });
      expect(await screen.findByText("Imported 2 cards.")).toBeInTheDocument();
      expect(stored().pins).toEqual([{ ...observerPin, tiles }, { kind: "node", ...pin }]);
      expect(await screen.findByRole("button", { name: "Change tile: Mean SNR" })).toBeInTheDocument();
    });
  });

  it("marks node results that are also observers", async () => {
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [{ ...node, isObserver: true, observerId }], hasMore: false, nextCursor: null });
    mount();
    typeSearch("repeater");
    expect(await screen.findByText("Observer")).toHaveClass("inline-flex");
  });

  it("lets every card stay on its own view", async () => {
    vi.mocked(api.getNode).mockImplementation(async (id) => ({ ...(id === second.id ? { ...node, ...second } : node), isObserver: true, observerId }));
    vi.mocked(api.getObserver).mockResolvedValue({ id: observerId, status: "online", publicKey: pin.publicKey } as never);
    save([pin, second]);
    mount();
    const first = await card("Renamed repeater");
    fireEvent.click(within(first).getByRole("button", { name: "Observer" }));
    expect(within(first).getByRole("button", { name: "Observer" })).toHaveAttribute("aria-pressed", "true");
    const other = await card("Second");
    fireEvent.click(within(other).getByRole("button", { name: "Heard by" }));
    expect(within(first).getByRole("button", { name: "Observer" })).toHaveAttribute("aria-pressed", "true");
    expect(within(other).getByRole("button", { name: "Heard by" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps both heard-by views open, saves reordering, removal and the range", async () => {
    save([pin, second]);
    mount();
    const first = await card("Renamed repeater");
    const next = await card("Second");
    fireEvent.click(within(first).getByRole("button", { name: "Heard by" }));
    fireEvent.click(within(next).getByRole("button", { name: "Heard by" }));
    expect(within(first).getByRole("button", { name: "Heard by" })).toHaveAttribute("aria-pressed", "true");
    expect(within(next).getByRole("button", { name: "Heard by" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(await screen.findByRole("button", { name: "Edit cards" }));
    fireEvent.keyDown(within(first).getByRole("button", { name: "Drag to reorder, or use the arrow keys" }), { key: "ArrowRight" });
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).pins[0].publicKey).toBe(second.publicKey);
    fireEvent.click(screen.getByRole("button", { name: "3d" }));
    expect(screen.getByRole("button", { name: "3d" })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).range).toBe("3d");
    fireEvent.click(within(first).getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("button", { name: "Renamed repeater" })).not.toBeInTheDocument();
  });

  it("uses French labels and keeps working when browser writes fail", async () => {
    const store = new Map<string, string>([[ATLAS_KEY, JSON.stringify({ version: 2, pins: [{ kind: "node", ...pin }], range: "24h" })]]);
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

  it("leaves edit mode when the last card is removed, so a card added later is not in it", async () => {
    save([pin]);
    mount();
    const first = await card("Renamed repeater");
    fireEvent.click(screen.getByRole("button", { name: "Edit cards" }));
    expect(screen.getByRole("button", { name: "Done" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(first).getByRole("button", { name: "Remove" }));
    expect(screen.getByText("No nodes saved")).toBeInTheDocument();
    typeSearch("repeater");
    fireEvent.click(await screen.findByRole("button", { name: "Add Renamed repeater" }));
    const again = await card("Renamed repeater");
    expect(screen.getByRole("button", { name: "Edit cards" })).toHaveAttribute("aria-pressed", "false");
    expect(within(again).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("leaves edit mode when the collection is emptied from outside, as on an account switch", async () => {
    save([pin]);
    mount();
    await card("Renamed repeater");
    fireEvent.click(screen.getByRole("button", { name: "Edit cards" }));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null })));
    expect(screen.getByText("No nodes saved")).toBeInTheDocument();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: ATLAS_KEY, newValue: JSON.stringify({ version: 2, pins: [{ kind: "node", ...second }], range: "24h" }) })));
    const next = await card("Second");
    expect(screen.getByRole("button", { name: "Edit cards" })).toHaveAttribute("aria-pressed", "false");
    expect(within(next).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("honours changes made in another tab and survives corrupt storage", async () => {
    localStorage.setItem(ATLAS_KEY, "{");
    mount();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: ATLAS_KEY, newValue: JSON.stringify({ version: 2, pins: [{ kind: "node", ...pin }], range: "3d" }) })));
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(screen.getByRole("button", { name: "3d" })).toHaveAttribute("aria-pressed", "true");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null })));
    expect(screen.getByText("No nodes saved")).toBeInTheDocument();
  });

  it("does not query a retained but inactive page", () => {
    save();
    mount(false);
    expect(api.getNode).not.toHaveBeenCalled();
    expect(api.getNodeActivity).not.toHaveBeenCalled();
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
    expect(result.id).toBe(second.id);
    expect(api.getNodesPage).toHaveBeenCalledWith(undefined, { pubkey: pin.publicKey, limit: 2 }, undefined);
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
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).pins[0].id).toBe(second.id));
  });
  it("does not adopt a mismatched identity or hide transport failures with broad searches", async () => {
    vi.mocked(api.getNode).mockResolvedValueOnce({ ...node, publicKey: second.publicKey });
    vi.mocked(api.getNodesPage).mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false });
    await expect(loadAtlasNode(pin)).rejects.toMatchObject({ message: "Atlas identity unavailable", status: 404 });
    vi.mocked(api.getNodesPage).mockClear(); vi.mocked(api.getNode).mockRejectedValueOnce(new Error("network"));
    await expect(loadAtlasNode(pin)).rejects.toThrow("network");
    expect(api.getNodesPage).not.toHaveBeenCalled();
  });
});
