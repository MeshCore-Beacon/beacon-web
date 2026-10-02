import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeshTab } from "../../../src/features/stats/MeshTab";
import i18n from "../../../src/i18n";
import { getStatsSeries, getPayloadBreakdown, getTopNodes, getTopObservers, getRadioPresets, getStatsScopes, getStatsNodeTypes } from "../../../src/api/client";
import type { EChartsOption } from "../../../src/features/stats/echarts-setup";
import type { SeriesValues, StatsSeries, StatsRange } from "../../../src/features/stats/types";

const region: { iatas: string[] | undefined; regionKey: string; isResolved: boolean; emptyRegion?: string } = { iatas: ["YVR"], regionKey: "YVR", isResolved: true };
const H = 3_600_000;
const values = (v: Partial<SeriesValues>): SeriesValues => ({ observations: 0, uniquePackets: 0, activeObservers: 0, activeIatas: 0, scopedPackets: 0, activeScopes: 0, maxPathEntries: 0, snrSum: 0, snrSamples: 0, rssiSum: 0, rssiSamples: 0, ...v });
const series: StatsSeries = {
  since: -21 * H, until: 3 * H, revision: 1, earliestComplete: 0, completeHours: 2,
  hours: [
    { hour: 0, status: "complete", values: values({ observations: 100, uniquePackets: 50, activeObservers: 2 }) },
    { hour: H, status: "complete", values: values({ observations: 122, uniquePackets: 61, activeObservers: 3 }) },
    { hour: 2 * H, status: "missing", values: null },
  ],
  summary: values({ observations: 222, uniquePackets: 111, activeObservers: 3, activeIatas: 4 }),
};
const withSummary = (v: Partial<SeriesValues>): StatsSeries => ({ ...series, summary: { ...series.summary, ...v } });
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/api/client", () => ({ getStatsSeries: vi.fn(), getPayloadBreakdown: vi.fn(), getTopNodes: vi.fn(), getTopObservers: vi.fn(), getRadioPresets: vi.fn(), getStatsScopes: vi.fn(), getStatsNodeTypes: vi.fn() }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: ({ option, onEvents }: { option: EChartsOption; onEvents?: Record<string, (p: unknown) => void> }) => <button data-testid="chart" onClick={() => onEvents?.click?.({ dataIndex: 0 })}>{JSON.stringify(option)}</button> }));

const clients: QueryClient[] = [];
beforeEach(() => {
  vi.clearAllMocks(); region.iatas = ["YVR"]; region.regionKey = "YVR"; region.isResolved = true; region.emptyRegion = undefined;
  vi.mocked(getStatsSeries).mockReset().mockResolvedValue(series);
  vi.mocked(getPayloadBreakdown).mockReset().mockResolvedValue([{ payloadType: 4, payloadTypeName: "ADVERT", count: 17 }]);
  vi.mocked(getTopNodes).mockReset().mockResolvedValue([{ nodeId: "node-id", publicKey: "abcdef0123456789", nodeName: "Old node", nodeType: 2, nodeTypeName: "Repeater", iata: "YVR", observationCount: 15, lastHeard: 0 }]);
  vi.mocked(getTopObservers).mockReset().mockResolvedValue([{ observerId: "observer-id", displayName: "Old observer", observerType: null, iata: "YVR", observationCount: 16 }]);
  vi.mocked(getRadioPresets).mockReset().mockResolvedValue([{ preset: "910.525,62.5,7", iata: "YVR", sourceType: "node", count: 18 }]);
  vi.mocked(getStatsScopes).mockReset().mockResolvedValue([{ name: "#old", packetCount: 19, observerCount: 2, nodeCount: 1 }]);
  vi.mocked(getStatsNodeTypes).mockReset().mockResolvedValue([{ nodeType: 2, nodeTypeName: "Repeater", count: 20 }]);
});
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

function card(title: string) { return title === "Scopes · selected region · retained data" ? screen.getByText("Scopes", { exact: true }).closest("details")! : screen.getByText(title).parentElement!.parentElement!; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function mount(range: StatsRange = "24h") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const onSelectObserver = vi.fn();
  const view = (range: StatsRange) => <QueryClientProvider client={client}><MeshTab range={range} onSelectObserver={onSelectObserver} /></QueryClientProvider>;
  const result = render(view(range));
  return { client, onSelectObserver, container: result.container, rerender: (next: StatsRange) => result.rerender(view(next)) };
}
async function loaded() { await waitFor(() => expect(screen.getAllByTestId("chart")).toHaveLength(6)); await screen.findByText("#old"); }


it("hides all previous-region values and sparklines until their own requests resolve", async () => {
  const { rerender, container } = mount(); await loaded();
  const next = deferred<StatsSeries>();
  vi.mocked(getStatsSeries).mockReturnValue(next.promise);
  vi.mocked(getPayloadBreakdown).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getTopNodes).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getTopObservers).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getRadioPresets).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getStatsScopes).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getStatsNodeTypes).mockImplementation(() => new Promise(() => {}));
  region.iatas = ["YOW"]; region.regionKey = "YOW"; rerender("24h");
  await waitFor(() => expect(getStatsSeries).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), ["YOW"], expect.any(AbortSignal)));
  expect(within(card("Total packets")).queryByText("111")).not.toBeInTheDocument();
  expect(within(card("Total packets")).getByText("—")).toBeInTheDocument();
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  expect(container.querySelectorAll("polyline")).toHaveLength(0);
  expect(screen.queryByText("#old")).not.toBeInTheDocument();
  expect(screen.queryByText("17 obs")).not.toBeInTheDocument();
  await act(() => next.resolve(withSummary({ uniquePackets: 333 })));
  await within(card("Total packets")).findByText("333");
  expect(screen.getAllByTestId("chart")).toHaveLength(1);
  within(card("Observations · 24h")).getByTestId("chart");
});

it("hides pending range charts while retaining fixed-24h KPIs, sparklines and population panels", async () => {
  const { rerender, container } = mount(); await loaded();
  vi.mocked(getStatsSeries).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getPayloadBreakdown).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getTopObservers).mockImplementation(() => new Promise(() => {}));
  vi.mocked(getTopNodes).mockImplementation(() => new Promise(() => {}));
  rerender("7d");
  expect(within(card("Observations · 7d")).getByText("Loading…")).toBeInTheDocument();
  expect(within(card("Top observers · 7d")).getByText("Loading…")).toBeInTheDocument();
  expect(within(card("Payload types · 7d")).getByText("Loading…")).toBeInTheDocument();
  expect(within(card("Top nodes · 7d")).getByText("Loading…")).toBeInTheDocument();
  expect(screen.queryByText("17 obs")).not.toBeInTheDocument();
  expect(screen.getAllByTestId("chart")).toHaveLength(2);
  expect(within(card("Total packets")).getByText("111")).toBeInTheDocument();
  expect(container.querySelectorAll("polyline")).toHaveLength(2);
  expect(getStatsSeries).toHaveBeenCalledTimes(2);
  expect(getTopNodes).toHaveBeenCalledTimes(2);
});

it("hides failed series values and sparklines without discarding the cache or healthy panels, then recovers", async () => {
  const { client, container } = mount(); await loaded();
  vi.mocked(getStatsSeries).mockRejectedValue(new Error("controlled series failure"));
  await act(() => client.refetchQueries({ queryKey: ["stats-series"] }));
  await waitFor(() => expect(within(card("Total packets")).queryByText("111")).not.toBeInTheDocument());
  expect(within(card("Total packets")).getByText("—")).toBeInTheDocument();
  expect(container.querySelectorAll("polyline")).toHaveLength(0);
  expect(client.getQueryData(["stats-series", "YVR", "24h"])).toEqual(series);
  expect(within(card("Observations · 24h")).getByText("Failed to load")).toBeInTheDocument();
  expect(screen.getAllByTestId("chart")).toHaveLength(5);
  vi.mocked(getStatsSeries).mockResolvedValue(withSummary({ uniquePackets: 444 }));
  await act(() => client.refetchQueries({ queryKey: ["stats-series"] }));
  await within(card("Total packets")).findByText("444");
});

it("draws sparklines from complete hours only", async () => {
  const { container } = mount(); await loaded();
  const lines = [...container.querySelectorAll("polyline")].map((l) => l.getAttribute("points")!.split(" ").length);
  expect(lines).toEqual([2, 2]);
});

it("breaks sparklines at missing hours instead of joining across them", async () => {
  const ok = (n: number) => ({ hour: n * H, status: "complete" as const, values: values({ observations: n + 1, activeObservers: n + 1 }) });
  vi.mocked(getStatsSeries).mockResolvedValue({ ...series, hours: [ok(0), ok(1), { hour: 2 * H, status: "missing", values: null }, ok(3), ok(4)] });
  const { container } = mount(); await loaded();
  const lines = [...container.querySelectorAll("polyline")].map((l) => l.getAttribute("points")!.split(" "));
  expect(lines.map((pts) => pts.length)).toEqual([2, 2, 2, 2]);
  expect(lines[1]![0]!.split(",")[0]).toBe("90");
});

it("plots observations and unique packets from the series, leaving gaps for unrolled hours", async () => {
  mount("7d"); await loaded();
  const option = JSON.parse(within(card("Observations · 7d")).getByTestId("chart").textContent!);
  expect(option.series.map((s: { data: unknown }) => s.data)).toEqual([
    [[0, 100], [H, 122], [2 * H, null]],
    [[0, 50], [H, 61], [2 * H, null]],
  ]);
  expect(getStatsSeries).toHaveBeenCalledTimes(2);
  const spans = vi.mocked(getStatsSeries).mock.calls.map((c) => c[1] - c[0]);
  expect(spans.sort()).toEqual([24 * H, 7 * 24 * H].sort());
});

it("names deleted top nodes by public key", async () => {
  vi.mocked(getTopNodes).mockResolvedValue([{ nodeId: null, publicKey: "deadbeef00112233", nodeName: null, nodeType: 2, nodeTypeName: "Repeater", iata: "YVR", observationCount: 15, lastHeard: 0 }]);
  mount(); await loaded();
  expect(within(card("Top nodes · 24h")).getByTestId("chart").textContent).toContain("deadbeef");
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
  const next = deferred<StatsSeries>(); vi.mocked(getStatsSeries).mockReturnValue(next.promise);
  let refresh!: Promise<void>;
  await act(async () => { refresh = client.refetchQueries({ queryKey: ["stats-series"] }); });
  expect(within(card("Total packets")).getByText("111")).toBeInTheDocument();
  expect(screen.getAllByTestId("chart")).toHaveLength(6);
  expect(container.querySelectorAll("polyline")).toHaveLength(2);
  fireEvent.click(within(card("Top observers · 24h")).getByTestId("chart"));
  expect(onSelectObserver).toHaveBeenCalledWith("observer-id");
  await act(async () => { next.resolve(withSummary({ uniquePackets: 555 })); await refresh; });
  await within(card("Total packets")).findByText("555");
});

it("distinguishes initial loading from successful empty results and zero totals", async () => {
  const next = deferred<StatsSeries>(); vi.mocked(getStatsSeries).mockReturnValue(next.promise);
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
  await act(() => next.resolve({ ...series, completeHours: 0, hours: [], summary: values({}) }));
  await screen.findByText("0 obs");
  expect(screen.getAllByText("No data")).toHaveLength(7);
  expect(within(card("Total packets")).getByText("0")).toBeInTheDocument();
});

it("keeps the scope list collapsed until requested", async () => {
  mount(); await loaded();
  const scopeList = screen.getByText("Scopes", { exact: true }).closest("details")!;
  expect(scopeList).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Scopes", { exact: true }));
  expect(scopeList).toHaveAttribute("open");
  expect(within(scopeList).getByText("#old")).toBeVisible();
});

it("labels the KPI cards with the rolled 24h window whatever the selected range", async () => {
  mount("7d"); await loaded();
  expect(screen.getAllByText("Last 24h · to 03:00 UTC")).toHaveLength(4);
  expect(within(card("Active areas")).getByText("4")).toBeInTheDocument();
});

it("shows French labels for the KPIs, chart titles and scope table", async () => {
  await act(() => i18n.changeLanguage("fr"));
  mount(); await loaded();
  expect(within(card("Paquets totaux")).getByText("111")).toBeInTheDocument();
  expect(screen.getAllByText("Dernières 24 h · jusqu’à 03:00 UTC")).toHaveLength(4);
  expect(screen.getByText("Observations · 24h")).toBeInTheDocument();
  expect(screen.getByText("Meilleurs nœuds · 24h")).toBeInTheDocument();
  const typesChart = within(card("Types de nœuds · historique complet")).getByTestId("chart");
  expect(typesChart.textContent).toContain("NŒUDS");
  fireEvent.click(screen.getByText("Scopes", { exact: true }));
  const scopeList = screen.getByText("Scopes", { exact: true }).closest("details")!;
  expect(within(scopeList).getByText("Scope")).toBeInTheDocument();
  expect(within(scopeList).getByText("Nœuds")).toBeInTheDocument();
  await act(() => i18n.changeLanguage("en"));
});

it("names the observation and preset chart series in French", async () => {
  await act(() => i18n.changeLanguage("fr"));
  mount(); await loaded();
  const obsChart = within(card("Observations · 24h")).getByTestId("chart").textContent;
  expect(obsChart).toContain('"legend":{"data":["Observations","Paquets uniques"]');
  const presetChart = within(card("Préréglages radio · historique complet")).getByTestId("chart").textContent;
  expect(presetChart).toContain('"Nœuds","Observateurs"');
  await act(() => i18n.changeLanguage("en"));
});

it("asks for an empty region by slug rather than falling back to every IATA", async () => {
  region.iatas = undefined; region.regionKey = "region:empty"; region.emptyRegion = "empty";
  mount(); await loaded();
  for (const call of vi.mocked(getStatsSeries).mock.calls) expect(call[2]).toEqual({ region: "empty" });
  expect(getStatsNodeTypes).toHaveBeenCalledWith({ region: "empty" });
});
