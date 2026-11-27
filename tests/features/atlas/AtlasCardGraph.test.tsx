import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AtlasCard } from "../../../src/features/atlas/AtlasCard";
import * as api from "../../../src/api/client";
import type { Node } from "../../../src/features/nodes/types";
import type { Observer } from "../../../src/features/observers/types";
import "../../../src/i18n";

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getNode: vi.fn(),
  getNodeActivity: vi.fn(),
  getNodesPage: vi.fn(),
  getPacketDetail: vi.fn(),
  getObserver: vi.fn(),
  getObserverActivity: vi.fn(),
  getObserverTelemetry: vi.fn(),
  getServerInfo: vi.fn(),
  getNodeTelemetry: vi.fn(),
  getNodePolling: vi.fn(),
}));
// ECharts needs a real canvas; what matters here is which series the dialog is handed.
vi.mock("../../../src/features/stats/EChart", () => ({
  EChart: ({ option }: { option: unknown }) => <output data-testid="chart">{JSON.stringify(option)}</output>,
}));

const HOUR = 3_600_000;
const pin = { kind: "node" as const, id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "Old name" };
const node = { ...pin, name: "Renamed repeater", nodeType: 2, nodeTypeName: "REPEATER", knownNeighborCount: 4, stale: false, lastSeen: Date.now(), iatas: [], lat: null, lng: null } as Node;
const nodeActivity = { windowStart: 0, windowEnd: 0, generatedAt: 0, range: "24h", summary: { observations: 1234, snrAvg: 0, rssiAvg: -106, hopAvg: 2 }, points: [{ t: Date.now() - HOUR, observations: 1234, snrAvg: 0, rssiAvg: -106, hopAvg: 2 }], latest: null };
const observerId = "33333333-3333-4333-8333-333333333333";
const observerPin = { kind: "observer" as const, observerId, name: "Hill listener" };
const observer = { id: observerId, status: "online", lastStatusAt: Date.now() - 60_000, iata: "YKF", observerType: "repeater", publicKey: "", firstSeen: 1, lastSeen: 2, observationCount: 5, brokers: [], uptimeSeconds: 90_000 } as unknown as Observer;
const activity = { range: "24h", interval: "1h", radio: null, payloadTypes: [{ payloadType: 4, payloadTypeName: "ADVERT", count: 9 }], points: [{ t: Date.now() - HOUR, observations: 12, snrAvg: 6.5, snrMin: null, rssiAvg: null, airtimeMs: null }] };
const telemetry = { range: "24h", interval: "1h", points: [
  { t: Date.now() - 2 * HOUR, batteryMv: 4100, noiseFloorDb: -115, airtimeTxSecs: 1000, airtimeRxSecs: 5000, uptimeSeconds: null, queueLength: null, receiveErrors: null },
  { t: Date.now() - HOUR, batteryMv: 4120, noiseFloorDb: -117, airtimeTxSecs: 1036, airtimeRxSecs: 5288, uptimeSeconds: null, queueLength: null, receiveErrors: null },
] };
const reading = (hoursAgo: number, extra: object) => ({ t: Date.now() - hoursAgo * HOUR, readings: 1, ...extra });
const readings = { range: "24h", interval: "1h", polled: true, untrustedReadings: 0, points: [reading(8, { batteryMv: 4150 }), reading(7, { batteryMv: 4160 }), reading(2, { batteryMv: 4226 })] };
const handlers = { onViewNode: vi.fn(), onViewObserver: vi.fn(), onAnalyzePacket: vi.fn(), onViewChange: vi.fn(), onRemove: vi.fn(), onResolved: vi.fn(), onUpgrade: vi.fn(), onTilesChange: vi.fn(), onTelemetryTilesChange: vi.fn(), onPinView: vi.fn() };
let client: QueryClient;

function mount(overrides: Partial<Parameters<typeof AtlasCard>[0]> = {}) {
  return render(
    <QueryClientProvider client={client}>
      <AtlasCard pin={pin} range="24h" active view="analytics" home="analytics" handle={{}} {...handlers} {...overrides} />
    </QueryClientProvider>,
  );
}
const drawn = () => (JSON.parse(screen.getByTestId("chart").textContent!).series[0].data as [number, number | null][]);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  vi.mocked(api.getNode).mockResolvedValue(node);
  vi.mocked(api.getNodeActivity).mockResolvedValue(nodeActivity as never);
  vi.mocked(api.getObserver).mockResolvedValue(observer);
  vi.mocked(api.getObserverActivity).mockResolvedValue(activity as never);
  vi.mocked(api.getObserverTelemetry).mockResolvedValue(telemetry as never);
  vi.mocked(api.getServerInfo).mockResolvedValue({ features: { polling: true, atlasTelemetry: true } } as never);
  vi.mocked(api.getNodePolling).mockResolvedValue({ polled: true, latestReadingAt: Date.now(), poller: null, standbys: [] } as never);
  vi.mocked(api.getNodeTelemetry).mockResolvedValue(readings as never);
});
afterEach(() => client.clear());

describe("A tile's graph", () => {
  it("opens from a node tile's sparkline, titled with the radio and the metric, and closes on Escape", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Open graph: Observations" }));
    const dialog = screen.getByRole("dialog", { name: "Renamed repeater: Observations" });
    expect(within(dialog).getByRole("heading", { name: "Renamed repeater: Observations" })).toBeInTheDocument();
    expect(within(dialog).getByText("24h, times in UTC")).toBeInTheDocument();
    expect(drawn()).toHaveLength(24);
    expect(drawn().filter(([, v]) => v)).toEqual([[Math.floor((Date.now() - HOUR) / HOUR) * HOUR, 1234]]);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(handlers.onViewNode).not.toHaveBeenCalled();
  });

  it("has a close button, and makes no request of its own", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Open graph: Mean RSSI" }));
    const calls = vi.mocked(api.getNodeActivity).mock.calls.length;
    const dialog = screen.getByRole("dialog", { name: "Renamed repeater: Mean RSSI" });
    expect(drawn().filter(([, v]) => v !== null).map(([, v]) => v)).toEqual([-106]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.getNodeActivity).toHaveBeenCalledTimes(calls);
  });

  it("is not offered by the presence strip, the packet types tile or a tile with no data", async () => {
    mount();
    await screen.findByRole("button", { name: "Open graph: Observations" });
    expect(screen.getAllByRole("button", { name: /^Open graph: / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Open graph: Observations", "Open graph: Mean SNR", "Open graph: Mean RSSI"]);
  });

  it("opens from an observer tile and leaves the tile picker working", async () => {
    mount({ pin: observerPin, view: "observer" });
    await screen.findByRole("button", { name: "Open graph: Noise floor" });
    expect(screen.getAllByRole("button", { name: /^Open graph: / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Open graph: Airtime", "Open graph: Battery", "Open graph: Noise floor"]);
    fireEvent.click(screen.getByRole("button", { name: "Change tile: Noise floor" }));
    expect(screen.getByRole("listbox", { name: "Change tile: Noise floor" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change tile: Noise floor" }));
    fireEvent.click(screen.getByRole("button", { name: "Open graph: Noise floor" }));
    expect(screen.getByRole("dialog", { name: "Hill listener: Noise floor" })).toBeInTheDocument();
    expect(drawn().filter(([, v]) => v !== null).map(([, v]) => v)).toEqual([-115, -117]);
    expect(handlers.onTilesChange).not.toHaveBeenCalled();
    expect(handlers.onViewObserver).not.toHaveBeenCalled();
  });

  it("opens from a Telemetry tile with each reading at its own time and a break where readings went missing", async () => {
    mount({ view: "telemetry" });
    fireEvent.click(await screen.findByRole("button", { name: "Open graph: Battery" }));
    expect(screen.getByRole("dialog", { name: "Renamed repeater: Battery" })).toBeInTheDocument();
    const points = drawn();
    expect(points.map(([, v]) => v)).toEqual([4.15, 4.16, null, 4.226]);
    expect(points[0]![0]).toBe(readings.points[0]!.t);
    expect(points[3]![0]).toBe(readings.points[2]!.t);
  });
});
