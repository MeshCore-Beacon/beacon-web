import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AtlasCard } from "../../../src/features/atlas/AtlasCard";
import * as api from "../../../src/api/client";
import { ApiError } from "../../../src/api/client";
import { formatHex } from "../../../src/lib/formatters";
import type { Node } from "../../../src/features/nodes/types";
import type { Observer } from "../../../src/features/observers/types";
import type { PacketDetail } from "../../../src/types/api";
import i18n from "../../../src/i18n";

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getNode: vi.fn(),
  getNodeActivity: vi.fn(),
  getNodesPage: vi.fn(),
  getPacketDetail: vi.fn(),
  getObserver: vi.fn(),
  getObserverActivity: vi.fn(),
  getObserverTelemetry: vi.fn(),
}));

const pin = { kind: "node" as const, id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "Old name" };
const node = { ...pin, name: "Renamed repeater", nodeType: 2, nodeTypeName: "REPEATER", knownNeighborCount: 4, stale: false, lastSeen: Date.now(), iatas: [], lat: null, lng: null } as Node;
const report = { packetHash: "ef".repeat(32), heardAt: Date.now() - 1000 };
const nodeActivity = { windowStart: 0, windowEnd: 0, generatedAt: 0, range: "24h", summary: { observations: 1234, snrAvg: 0, rssiAvg: -106, hopAvg: 2 }, points: [{ t: Date.now() - 3_600_000, observations: 1234, snrAvg: 0, rssiAvg: -106, hopAvg: 2 }], latest: report };
const detail = { packetHash: report.packetHash, originPubkey: pin.publicKey, header: { payloadType: 4 }, observations: [
  { observerId: "observer-a", observerName: "Home listener", id: 1, heardAt: 1, iata: "YKF" },
  { observerId: "observer-a", observerName: "Home listener", id: 2, heardAt: 2, iata: "YKF" },
  { observerId: "observer-b", observerName: "Hill listener", id: 3, heardAt: 3, iata: "YKF" },
] } as unknown as PacketDetail;
const observerId = "33333333-3333-4333-8333-333333333333";
const observer = { id: observerId, status: "online", lastStatusAt: Date.now() - 60_000, iata: "YKF", observerType: "repeater", radioFreqMhz: 915, radioSf: 11, radioBwKhz: 250, publicKey: pin.publicKey, firstSeen: 1, lastSeen: 2, observationCount: 5, brokers: [], uptimeSeconds: 90_000 } as Observer;
const activity = { range: "24h", interval: "1h", radio: null, payloadTypes: [{ payloadType: 4, payloadTypeName: "ADVERT", count: 9 }, { payloadType: 5, payloadTypeName: "GRP_TXT", count: 3 }], points: [{ t: Date.now() - 3_600_000, observations: 12, snrAvg: 6.5, snrMin: null, rssiAvg: null, airtimeMs: null }] };
const telemetry = { range: "24h", interval: "1h", points: [
  { t: Date.now() - 2 * 3_600_000, batteryMv: 4100, noiseFloorDb: -115, airtimeTxSecs: 1000, airtimeRxSecs: 5000, uptimeSeconds: null, queueLength: null, receiveErrors: null },
  { t: Date.now() - 3_600_000, batteryMv: 4120, noiseFloorDb: -117, airtimeTxSecs: 1036, airtimeRxSecs: 5288, uptimeSeconds: null, queueLength: null, receiveErrors: null },
] };
const handlers = {
  onViewNode: vi.fn(),
  onViewObserver: vi.fn(),
  onAnalyzePacket: vi.fn(),
  onViewChange: vi.fn(),
  onRemove: vi.fn(),
  onResolved: vi.fn(),
  onUpgrade: vi.fn(),
  onTilesChange: vi.fn(),
};
let client: QueryClient;

function mount(overrides: Partial<Parameters<typeof AtlasCard>[0]> = {}) {
  return render(
    <QueryClientProvider client={client}>
      <AtlasCard pin={pin} range="24h" active view="analytics" handle={{}} {...handlers} {...overrides} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  vi.mocked(api.getNode).mockResolvedValue(node);
  vi.mocked(api.getNodeActivity).mockResolvedValue(nodeActivity);
  vi.mocked(api.getPacketDetail).mockResolvedValue(detail);
});
afterEach(() => client.clear());

describe("AtlasCard", () => {
  it("renders the Signal tab tiles for one node with its type and freshness badges", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Renamed repeater" })).toBeInTheDocument();
    expect(screen.getByText("REPEATER")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("Observations")).toBeInTheDocument();
    expect(screen.getByText("Mean SNR")).toBeInTheDocument();
    expect(await screen.findByText("0.0 dB")).toBeInTheDocument();
    expect(screen.getByText("1.2k")).toBeInTheDocument();
    expect(screen.getByText("-106.0 dBm")).toBeInTheDocument();
    expect(screen.getByText("Active hours")).toBeInTheDocument();
    expect(screen.getByText("1/24")).toBeInTheDocument();
    expect(screen.getByText("24h")).toBeInTheDocument();
    expect(screen.getByText(/Mean hops 2\.0/)).toBeInTheDocument();
    expect(api.getNodeActivity).toHaveBeenCalledWith(pin.id, "24h", expect.any(AbortSignal));
    expect(screen.queryByText(/battery|telemetry/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renamed repeater" }));
    expect(handlers.onViewNode).toHaveBeenCalledWith(pin.id);
  });

  it("shows the stale badge and the server's type name even when the type is unknown", async () => {
    vi.mocked(api.getNode).mockResolvedValue({ ...node, stale: true, nodeType: 9, nodeTypeName: "WEIRD" });
    mount();
    expect(await screen.findByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("WEIRD")).toBeInTheDocument();
    expect(screen.queryByText(/atlas\.roles/)).not.toBeInTheDocument();
  });

  it("reports a server ID that differs from the pin so the page can update it", async () => {
    const recovered = "22222222-2222-4222-8222-222222222222";
    vi.mocked(api.getNode).mockResolvedValue({ ...node, id: recovered });
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(handlers.onResolved).toHaveBeenCalledWith(recovered, undefined);
  });

  it("leaves the pin alone when the server ID still matches", async () => {
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(handlers.onResolved).not.toHaveBeenCalled();
  });

  it("lets the action buttons drop under the title instead of squeezing the name", async () => {
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    const actions = screen.getByRole("button", { name: "Remove" }).parentElement!;
    expect(actions).toHaveClass("ml-auto");
    expect(actions.parentElement).toHaveClass("flex-wrap");
  });

  it("fills its grid row so neighbouring cards stay the same height whatever their titles wrap to", async () => {
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    const tiles = screen.getByText("Observations").closest(".grid")!;
    expect(tiles).toHaveClass("flex-1");
    expect(tiles.parentElement).toHaveClass("flex-1");
    expect(tiles.closest(".rounded-lg.border.p-3\\.5")).toHaveClass("flex", "h-full", "flex-col");
    expect(await screen.findByText("-106.0 dBm")).toHaveClass("text-xl");
  });

  it("labels an unnamed node by its ID prefix, dimmed, as the Nodes page does", async () => {
    vi.mocked(api.getNode).mockResolvedValue({ ...node, name: "" });
    mount({ pin: { ...pin, name: "" } });
    const title = await screen.findByRole("button", { name: formatHex(pin.id) });
    expect(title).toHaveClass("italic");
  });

  it("says the node is gone instead of offering a retry when the server has no such key", async () => {
    vi.mocked(api.getNode).mockRejectedValue(new ApiError(404, "not_found", "missing"));
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    mount();
    expect(await screen.findByText("Node not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
  });

  it("renders dashes for an empty sample without NaN", async () => {
    vi.mocked(api.getNodeActivity).mockResolvedValue({ ...nodeActivity, summary: { observations: 0, snrAvg: null, rssiAvg: null, hopAvg: null }, points: [], latest: null });
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(await screen.findByText("0")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("0/24")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getByText("24h")).toBeInTheDocument();
  });

  it("flips the body between the tiles and the heard-by list instead of growing the card", async () => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 240 });
    const view = mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(api.getPacketDetail).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Move/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drag to reorder, or use the arrow keys" })).toBeInTheDocument();
    const picker = screen.getByRole("group", { name: "Card view" });
    expect(within(picker).getByRole("button", { name: "Analytics" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(picker).getByRole("button", { name: "Heard by" }));
    expect(handlers.onViewChange).toHaveBeenCalledWith("heard");
    view.rerender(
      <QueryClientProvider client={client}>
        <AtlasCard pin={pin} range="24h" active view="heard" handle={{}} {...handlers} />
      </QueryClientProvider>,
    );
    const summary = await screen.findByText(/2 observers heard the latest packet/);
    expect(summary).toHaveTextContent(/ago$/);
    expect(screen.getByRole("button", { name: "Heard by" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Mean SNR")).not.toBeInTheDocument();
    expect(summary.parentElement).toHaveStyle({ height: "240px" });
    expect(summary.nextElementSibling).toHaveClass("overflow-y-auto");
    expect(screen.getAllByRole("button", { name: "Home listener" })).toHaveLength(1);
    expect(screen.getAllByText("YKF")[0]).toHaveClass("bg-primary/6");
    fireEvent.click(screen.getByRole("button", { name: "Home listener" }));
    expect(handlers.onViewObserver).toHaveBeenCalledWith("observer-a");
    fireEvent.click(screen.getByRole("button", { name: "Open packet" }));
    expect(handlers.onAnalyzePacket).toHaveBeenCalledWith(report.packetHash);
    delete (HTMLElement.prototype as { offsetHeight?: unknown }).offsetHeight;
  });

  it("hides observer links for a different origin identity and explains expired packets", async () => {
    vi.mocked(api.getPacketDetail).mockResolvedValue({ ...detail, originPubkey: "cd".repeat(32) });
    mount({ view: "heard" });
    expect(await screen.findByText("Packet details are unavailable or expired.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open packet" })).not.toBeInTheDocument();
  });

  it("says so when the window is marked partly unread and when it holds no packet", async () => {
    const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    vi.mocked(api.getNodeActivity).mockResolvedValue({ ...nodeActivity, rawFrom: hour - 3 * 3_600_000, latest: null });
    const view = mount();
    expect(await screen.findByText("Partial history")).toBeInTheDocument();
    view.unmount();
    mount({ view: "heard" });
    expect(await screen.findByText("No observations in this window.")).toBeInTheDocument();
    expect(api.getPacketDetail).not.toHaveBeenCalled();
  });

  it("explains when the server lacks node activity, in both node views, and leaves the tiles as dashes", async () => {
    vi.mocked(api.getNodeActivity).mockRejectedValue(new ApiError(404, "not_found", "no"));
    const view = mount();
    expect(await screen.findByText(/More information:.*does not provide node activity/)).toBeInTheDocument();
    expect(screen.queryByText(/ dBm?$/)).not.toBeInTheDocument();
    expect(screen.getByText("0/24")).toBeInTheDocument();
    view.unmount();
    mount({ view: "heard" });
    expect(await screen.findByText("This server does not provide node activity.")).toBeInTheDocument();
  });

  it("reports a failed activity load without hiding the node", async () => {
    vi.mocked(api.getNodeActivity).mockRejectedValue(new ApiError(500, "boom", "boom"));
    mount();
    expect(await screen.findByText("Failed to load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renamed repeater" })).toBeEnabled();
  });

  it("keeps an unavailable node removable and draggable", async () => {
    vi.mocked(api.getNode).mockRejectedValue(new Error("down"));
    mount({ handle: { "data-grip": "yes" } as Record<string, string> });
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load");
    expect(screen.getByRole("button", { name: "Drag to reorder, or use the arrow keys" })).toHaveAttribute("data-grip", "yes");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(handlers.onRemove).toHaveBeenCalled();
    expect(screen.queryByText("Mean SNR")).not.toBeInTheDocument();
  });

  it("offers the Observer view only when the node is also an observer, and tells the page the link", async () => {
    const first = mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    const picker = screen.getByRole("group", { name: "Card view" });
    expect(within(picker).getAllByRole("button").map((b) => b.textContent)).toEqual(["Analytics", "Heard by"]);
    expect(handlers.onResolved).not.toHaveBeenCalled();
    first.unmount();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(api.getNode).mockResolvedValue({ ...node, isObserver: true, observerId });
    vi.mocked(api.getObserver).mockResolvedValue(observer);
    mount({ pin: { ...pin, id: "22222222-2222-4222-8222-222222222222" } });
    await waitFor(() => expect(handlers.onResolved).toHaveBeenCalledWith(node.id, observerId));
    expect(within(screen.getByRole("group", { name: "Card view" })).getAllByRole("button")).toHaveLength(3);
  });

  it("renders the Observer view tiles from activity and telemetry in the same frame", async () => {
    vi.mocked(api.getNode).mockResolvedValue({ ...node, isObserver: true, observerId });
    vi.mocked(api.getObserver).mockResolvedValue(observer);
    vi.mocked(api.getObserverActivity).mockResolvedValue(activity as never);
    vi.mocked(api.getObserverTelemetry).mockResolvedValue(telemetry as never);
    mount({ view: "observer" });
    expect(await screen.findByText("Airtime")).toBeInTheDocument();
    await screen.findByText("12");
    expect(screen.getByText("9.0%")).toBeInTheDocument();
    expect(screen.getByText("TX 1.0% · RX 8.0%")).toBeInTheDocument();
    expect(screen.getByText("Packet types")).toBeInTheDocument();
    expect(screen.getByText(/advert 75%/)).toBeInTheDocument();
    expect(screen.getByText(/grp_txt 25%/)).toBeInTheDocument();
    expect(screen.queryByText("Packets heard")).not.toBeInTheDocument();
    expect(screen.getByText("-117 dBm")).toBeInTheDocument();
    expect(screen.getByText("4.12V")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("915 MHz · SF11 · 250 kHz").closest(".flex-wrap")).toBeInTheDocument();
    expect(screen.getByText("Airtime").closest(".grid")).toHaveClass("flex-1", "grid-cols-2");
    expect(screen.queryByText("Mean SNR")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Observer" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows dashes and explains when the server lacks the observer endpoints", async () => {
    vi.mocked(api.getNode).mockResolvedValue({ ...node, isObserver: true, observerId });
    vi.mocked(api.getObserver).mockResolvedValue(observer);
    vi.mocked(api.getObserverActivity).mockRejectedValue(new ApiError(404, "not_found", "no"));
    vi.mocked(api.getObserverTelemetry).mockRejectedValue(new ApiError(404, "not_found", "no"));
    mount({ view: "observer" });
    expect(await screen.findByText(/More information:.*does not provide observer activity/)).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByText("1d 1h 0m")).toBeInTheDocument();
  });

  it("renders an observer-only pin with its status badge, a dashboard link and no picker", async () => {
    vi.mocked(api.getObserver).mockResolvedValue({ ...observer, publicKey: "" });
    vi.mocked(api.getObserverActivity).mockResolvedValue(activity as never);
    vi.mocked(api.getObserverTelemetry).mockResolvedValue(telemetry as never);
    mount({ pin: { kind: "observer", observerId, name: "Hill listener" }, view: "observer" });
    expect(await screen.findByText("repeater")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hill listener" }));
    expect(handlers.onViewObserver).toHaveBeenCalledWith(observerId);
    expect(screen.getAllByText("Online")[0]).toHaveClass("bg-green/8");
    expect(screen.queryByRole("group", { name: "Card view" })).not.toBeInTheDocument();
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(api.getNode).not.toHaveBeenCalled();
  });

  it("looks an observer pin's node up once per poll, not on every parent render", async () => {
    vi.mocked(api.getObserver).mockResolvedValue(observer);
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    const observerPin = { kind: "observer" as const, observerId, name: "Hill listener" };
    const view = mount({ pin: observerPin, view: "observer" });
    await waitFor(() => expect(api.getNodesPage).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 3; i++) {
      view.rerender(
        <QueryClientProvider client={client}>
          <AtlasCard pin={{ ...observerPin }} range="24h" active view="observer" handle={{}} {...handlers} onUpgrade={vi.fn()} />
        </QueryClientProvider>,
      );
    }
    await screen.findByText("repeater");
    expect(api.getNodesPage).toHaveBeenCalledTimes(1);
    expect(handlers.onUpgrade).not.toHaveBeenCalled();
  });

  it("says it is loading the observer series and keeps a saved link a node record does not carry", async () => {
    vi.mocked(api.getNode).mockResolvedValue({ ...node, id: "22222222-2222-4222-8222-222222222222" });
    vi.mocked(api.getObserver).mockResolvedValue(observer);
    vi.mocked(api.getObserverActivity).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.getObserverTelemetry).mockReturnValue(new Promise(() => {}));
    mount({ pin: { ...pin, observerId }, view: "observer" });
    expect(await screen.findByText("Airtime")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    await waitFor(() => expect(handlers.onResolved).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", observerId));
  });

  describe("observer view tiles", () => {
    const observerPin = { kind: "observer" as const, observerId, name: "Hill listener" };
    const signalActivity = { ...activity, points: [{ ...activity.points[0]!, rssiAvg: -97.25 }] };
    const queueTelemetry = { ...telemetry, points: telemetry.points.map((p, i) => ({ ...p, queueLength: 3 + i, receiveErrors: 40 + 5 * i })) };
    const labels = () => screen.getAllByRole("button", { name: /^Change tile: / }).map((b) => b.getAttribute("aria-label")!.replace("Change tile: ", ""));
    beforeEach(() => {
      vi.mocked(api.getObserver).mockResolvedValue({ ...observer, publicKey: "" });
      vi.mocked(api.getObserverActivity).mockResolvedValue(signalActivity as never);
      vi.mocked(api.getObserverTelemetry).mockResolvedValue(queueTelemetry as never);
    });

    it("shows today's four tiles for a pin with no saved layout, and no reset", async () => {
      mount({ pin: observerPin, view: "observer" });
      await screen.findByText("12");
      expect(labels()).toEqual(["Airtime", "Battery", "Packet types", "Noise floor"]);
      expect(screen.queryByRole("button", { name: "Reset tiles" })).not.toBeInTheDocument();
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("offers only the metrics not already on the card and swaps the chosen slot", async () => {
      mount({ pin: observerPin, view: "observer" });
      await screen.findByText("12");
      const trigger = screen.getByRole("button", { name: "Change tile: Battery" });
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      const list = screen.getByRole("listbox", { name: "Change tile: Battery" });
      expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Uptime", "Packets heard", "Mean SNR", "Mean RSSI", "Queue length", "Receive errors"]);
      fireEvent.click(within(list).getByRole("option", { name: "Mean SNR" }));
      expect(handlers.onTilesChange).toHaveBeenCalledWith(["airtime", "snr", "types", "noise"]);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      expect(handlers.onRemove).not.toHaveBeenCalled();
    });

    it("opens each picker under its own label, and above it for the bottom row so it stays in the card", async () => {
      mount({ pin: observerPin, view: "observer" });
      await screen.findByText("12");
      const panel = (name: string) => {
        fireEvent.click(screen.getByRole("button", { name: `Change tile: ${name}` }));
        return screen.getByRole("listbox", { name: `Change tile: ${name}` }).parentElement!;
      };
      expect(panel("Airtime")).toHaveClass("left-0", "top-full");
      expect(panel("Battery")).toHaveClass("left-0", "top-full");
      expect(panel("Packet types")).toHaveClass("left-0", "bottom-full");
      expect(panel("Noise floor")).toHaveClass("left-0", "bottom-full");
    });

    it("renders a saved layout with the new series and resets it", async () => {
      mount({ pin: { ...observerPin, tiles: ["snr", "rssi", "queue", "errors"] }, view: "observer" });
      expect(await screen.findByText("6.5 dB")).toBeInTheDocument();
      expect(labels()).toEqual(["Mean SNR", "Mean RSSI", "Queue length", "Receive errors"]);
      expect(screen.getByText("-97.3 dBm")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.queryByText("Airtime")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Reset tiles" }));
      expect(handlers.onTilesChange).toHaveBeenCalledWith(["airtime", "battery", "types", "noise"]);
    });

    it("shows packets heard per hour and uptime as their own tiles, and no second uptime for a missing battery", async () => {
      vi.mocked(api.getObserverTelemetry).mockResolvedValue({ ...telemetry, points: telemetry.points.map((p) => ({ ...p, batteryMv: null })) } as never);
      mount({ pin: { ...observerPin, tiles: ["packets", "uptime", "battery", "noise"] }, view: "observer" });
      expect(await screen.findByText("12")).toBeInTheDocument();
      expect(labels()).toEqual(["Packets heard", "Uptime", "Battery", "Noise floor"]);
      expect(screen.getAllByText("1d 1h 0m")).toHaveLength(1);
      expect(screen.queryByText(/advert/)).not.toBeInTheDocument();
    });

    it("leaves the node Analytics view without pickers", async () => {
      vi.mocked(api.getNode).mockResolvedValue({ ...node, isObserver: true, observerId });
      mount({ pin: { ...pin, observerId, tiles: ["snr", "rssi", "queue", "errors"] } });
      await screen.findByText("Mean SNR");
      expect(screen.queryByRole("button", { name: /^Change tile: / })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reset tiles" })).not.toBeInTheDocument();
    });

    it("uses French labels for the picker and reset", async () => {
      await act(() => i18n.changeLanguage("fr"));
      mount({ pin: { ...observerPin, tiles: ["snr", "battery", "types", "noise"] }, view: "observer" });
      expect(await screen.findByRole("button", { name: "Changer la tuile : SNR moyen" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Réinitialiser les tuiles" })).toBeInTheDocument();
      await act(() => i18n.changeLanguage("en"));
    });
  });

  it("upgrades an observer-only pin to a node pin when its key now resolves to a node", async () => {
    vi.mocked(api.getObserver).mockResolvedValue(observer);
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [node], hasMore: false, nextCursor: null });
    mount({ pin: { kind: "observer", observerId, name: "Hill listener" }, view: "observer" });
    await waitFor(() => expect(handlers.onUpgrade).toHaveBeenCalledWith(expect.objectContaining({ id: node.id }), observerId));
  });
});
