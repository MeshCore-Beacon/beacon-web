import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeshTab } from "../../../src/features/stats/MeshTab";
import { getStatsOverview, getStatsObservations, getPayloadBreakdown, getTopNodes, getTopObservers, getRadioPresets, getStatsScopes, getStatsNodeTypes } from "../../../src/api/client";
import type { WsManager } from "../../../src/api/ws-manager";
import type { EChartsOption } from "../../../src/features/stats/echarts-setup";
import type { StatsOverview, StatsRange } from "../../../src/features/stats/types";

const region = { iatas: ["YVR"], regionKey: "YVR", isResolved: true };
const overview = { totalPackets: 111, totalObservations: 222, activeObservers: 3, activeIatas: 4, windowHours: 24 };
const points = [1, 2].map((hour) => ({ hour: hour * 3_600_000, iata: "YVR", observationCount: hour * 10, uniquePackets: hour, activeObservers: hour }));
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/features/stats/useLiveStats", () => ({ useLiveOverview: vi.fn() }));
vi.mock("../../../src/api/client", () => ({ getStatsOverview: vi.fn(), getStatsObservations: vi.fn(), getPayloadBreakdown: vi.fn(), getTopNodes: vi.fn(), getTopObservers: vi.fn(), getRadioPresets: vi.fn(), getStatsScopes: vi.fn(), getStatsNodeTypes: vi.fn() }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: ({ option, onEvents }: { option: EChartsOption; onEvents?: Record<string, (p: unknown) => void> }) => <button data-testid="chart" onClick={() => onEvents?.click?.({ dataIndex: 0 })}>{JSON.stringify(option)}</button> }));

const clients: QueryClient[] = [];
beforeEach(() => {
  vi.clearAllMocks(); region.iatas = ["YVR"]; region.regionKey = "YVR"; region.isResolved = true;
  vi.mocked(getStatsOverview).mockReset().mockResolvedValue(overview);
  vi.mocked(getStatsObservations).mockReset().mockResolvedValue(points);
  vi.mocked(getPayloadBreakdown).mockReset().mockResolvedValue([{ payloadType: 4, payloadTypeName: "ADVERT", count: 17 }]);
  vi.mocked(getTopNodes).mockReset().mockResolvedValue([{ nodeId: "node-id", nodeName: "Old node", nodeType: 2, nodeTypeName: "Repeater", iata: "YVR", observationCount: 15, lastHeard: 0 }]);
  vi.mocked(getTopObservers).mockReset().mockResolvedValue([{ observerId: "observer-id", displayName: "Old observer", observerType: null, iata: "YVR", observationCount: 16 }]);
  vi.mocked(getRadioPresets).mockReset().mockResolvedValue([{ preset: "910.525,62.5,7", iata: "YVR", sourceType: "node", count: 18 }]);
  vi.mocked(getStatsScopes).mockReset().mockResolvedValue([{ name: "#old", packetCount: 19, observerCount: 2, nodeCount: 1 }]);
  vi.mocked(getStatsNodeTypes).mockReset().mockResolvedValue([{ nodeType: 2, nodeTypeName: "Repeater", count: 20 }]);
});
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

function card(title: string) { return screen.getByText(title).parentElement!.parentElement!; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function mount(range: StatsRange = "24h") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const onSelectObserver = vi.fn();
  const view = (range: StatsRange) => <QueryClientProvider client={client}><MeshTab range={range} onSelectObserver={onSelectObserver} wsManager={{} as WsManager} /></QueryClientProvider>;
  const result = render(view(range));
  return { client, onSelectObserver, container: result.container, rerender: (next: StatsRange) => result.rerender(view(next)) };
}
async function loaded() { await waitFor(() => expect(screen.getAllByTestId("chart")).toHaveLength(6)); await screen.findByText("#old"); }

it("hides all previous-region values and sparklines until their own requests resolve", async () => {
  const { rerender, container } = mount(); await loaded();
  const next = deferred<StatsOverview>();
  vi.mocked(getStatsOverview).mockReturnValue(next.promise);
  vi.mocked(getStatsObservations).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getPayloadBreakdown).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getTopNodes).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getTopObservers).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getRadioPresets).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getStatsScopes).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getStatsNodeTypes).mockImplementation(() => new Promise(() => {}));
  region.iatas = ["YOW"]; region.regionKey = "YOW"; rerender("24h");
  await waitFor(() => expect(getStatsOverview).toHaveBeenCalledWith(["YOW"]));
  expect(within(card("Total packets")).queryByText("111")).not.toBeInTheDocument();
  expect(within(card("Total packets")).getByText("—")).toBeInTheDocument();
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  expect(container.querySelectorAll("polyline")).toHaveLength(0);
  expect(screen.queryByText("#old")).not.toBeInTheDocument();
  expect(screen.queryByText("17 obs")).not.toBeInTheDocument();
  await act(() => next.resolve({ ...overview, totalPackets: 333 }));
  await within(card("Total packets")).findByText("333");
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
});

it("hides pending range charts while retaining fixed-24h KPIs, sparklines and population panels", async () => {
  const { rerender, container } = mount(); await loaded();
  vi.mocked(getStatsObservations).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getPayloadBreakdown).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getTopObservers).mockImplementation(() => new Promise(() => {}));
  rerender("7d");
  expect(within(card("Observations · 7d")).getByText("Loading…")).toBeInTheDocument();
  expect(within(card("Top observers · 7d")).getByText("Loading…")).toBeInTheDocument();
  expect(within(card("Payload types · 7d")).getByText("Loading…")).toBeInTheDocument();
  expect(screen.queryByText("17 obs")).not.toBeInTheDocument();
  expect(screen.getAllByTestId("chart")).toHaveLength(3);
  expect(within(card("Total packets")).getByText("111")).toBeInTheDocument();
  expect(container.querySelectorAll("polyline")).toHaveLength(2);
  expect(screen.getByText("#old")).toBeInTheDocument();
  expect(getStatsOverview).toHaveBeenCalledOnce();
  expect(getStatsObservations).toHaveBeenCalledTimes(2);
  expect(getTopNodes).toHaveBeenCalledOnce();
});

it("hides failed overview values without discarding the cache or healthy panels, then recovers", async () => {
  const { client } = mount(); await loaded();
  vi.mocked(getStatsOverview).mockRejectedValue(new Error("controlled overview failure"));
  await act(() => client.refetchQueries({ queryKey: ["stats-overview"] }));
  await waitFor(() => expect(within(card("Total packets")).queryByText("111")).not.toBeInTheDocument());
  expect(within(card("Total packets")).getByText("—")).toBeInTheDocument();
  expect(client.getQueryData(["stats-overview", "YVR"])).toEqual(overview);
  expect(screen.getAllByTestId("chart")).toHaveLength(6);
  vi.mocked(getStatsOverview).mockResolvedValue({ ...overview, totalPackets: 444 });
  await act(() => client.refetchQueries({ queryKey: ["stats-overview"] }));
  await within(card("Total packets")).findByText("444");
});

it("hides only failed 24h sparklines while the selected-range chart and KPI values remain usable", async () => {
  const { client, container } = mount("7d"); await loaded();
  expect(container.querySelectorAll("polyline")).toHaveLength(2);
  vi.mocked(getStatsObservations).mockRejectedValue(new Error("controlled sparkline failure"));
  await act(() => client.refetchQueries({ queryKey: ["stats-observations", "YVR", "24h"], exact: true }));
  await waitFor(() => expect(container.querySelectorAll("polyline")).toHaveLength(0));
  expect(within(card("Total packets")).getByText("111")).toBeInTheDocument();
  expect(within(card("Observations · 7d")).getByTestId("chart")).toBeInTheDocument();
  expect(client.getQueryData(["stats-observations", "YVR", "24h"])).toEqual(points);
});

it("does not report a cached payload total after a failed refresh", async () => {
  const { client } = mount(); await loaded();
  vi.mocked(getPayloadBreakdown).mockRejectedValue(new Error("controlled payload failure"));
  await act(() => client.refetchQueries({ queryKey: ["stats-payload"] }));
  await within(card("Payload types · 24h")).findByText("Failed to load");
  expect(screen.queryByText("17 obs")).not.toBeInTheDocument();
  expect(screen.getByText("— obs")).toBeInTheDocument();
  expect(screen.getAllByTestId("chart")).toHaveLength(5);
});

it("retains valid values, series, sparklines and observer navigation during same-key background refreshes", async () => {
  const { client, container, onSelectObserver } = mount(); await loaded();
  const next = deferred<StatsOverview>(); vi.mocked(getStatsOverview).mockReturnValue(next.promise);
  let refresh!: Promise<void>;
  await act(async () => { refresh = client.refetchQueries({ queryKey: ["stats-overview"] }); });
  expect(within(card("Total packets")).getByText("111")).toBeInTheDocument();
  expect(screen.getAllByTestId("chart")).toHaveLength(6);
  expect(container.querySelectorAll("polyline")).toHaveLength(2);
  fireEvent.click(within(card("Top observers · 24h")).getByTestId("chart"));
  expect(onSelectObserver).toHaveBeenCalledWith("observer-id");
  await act(async () => { next.resolve({ ...overview, totalPackets: 555 }); await refresh; });
  await within(card("Total packets")).findByText("555");
});

it("distinguishes initial loading from successful empty results and zero totals", async () => {
  const next = deferred<StatsOverview>(); vi.mocked(getStatsOverview).mockReturnValue(next.promise);
  vi.mocked(getStatsObservations).mockResolvedValue([]);
  vi.mocked(getPayloadBreakdown).mockResolvedValue([]);
  vi.mocked(getTopNodes).mockResolvedValue([]);
  vi.mocked(getTopObservers).mockResolvedValue([]);
  vi.mocked(getRadioPresets).mockResolvedValue([]);
  vi.mocked(getStatsScopes).mockResolvedValue([]);
  vi.mocked(getStatsNodeTypes).mockResolvedValue([]);
  mount();
  expect(screen.queryByText("0 obs")).not.toBeInTheDocument();
  expect(screen.queryByText("No data")).not.toBeInTheDocument();
  expect(within(card("Total packets")).getByText("—")).toBeInTheDocument();
  await act(() => next.resolve({ totalPackets: 0, totalObservations: 0, activeObservers: 0, activeIatas: 0, windowHours: 24 }));
  await screen.findByText("0 obs");
  expect(screen.getAllByText("No data")).toHaveLength(7);
  expect(within(card("Total packets")).getByText("0")).toBeInTheDocument();
});
