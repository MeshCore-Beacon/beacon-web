import { beforeEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NeighbourGraphTab } from "../../../src/features/stats/NeighbourGraphTab";
import { neighbourGraphOption } from "../../../src/features/stats/neighbour-graph";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { ForceLayoutInput } from "../../../src/features/stats/graph-layout";
import type { GraphNode } from "../../../src/features/stats/neighbour-graph";
import type { EChartsOption } from "../../../src/features/stats/echarts-setup";
import type { ChartColors } from "../../../src/features/stats/chartTheme";
import i18n from "../../../src/i18n";

const region = { iatas: ["YVR"] as string[] | undefined, regionKey: "YVR" };
const nodes = { nodes: [] as NodeSummary[], loadedCount: 0, isPaging: false, isError: false };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/features/map/useMapNodesData", () => ({ useMapNodesData: () => nodes }));
const graphProps = vi.hoisted(() => ({ last: null as { option: EChartsOption; nodes: GraphNode[] } | null }));
vi.mock("../../../src/features/stats/NeighbourGraph", () => ({
  NeighbourGraph: (p: { option: EChartsOption; nodes: GraphNode[] }) => {
    graphProps.last = p;
    return null;
  },
}));
vi.mock("../../../src/api/client", () => ({ getNodeNeighbors: vi.fn() }));

// jsdom has no Worker: each layout job is a promise the test settles by hand
interface Job { input: ForceLayoutInput; resolve: (xy: Float64Array) => void; cancel: ReturnType<typeof vi.fn> }
const jobs = vi.hoisted(() => [] as Job[]);
vi.mock("../../../src/features/stats/layout-worker", () => ({
  startLayout: (input: ForceLayoutInput) => {
    let resolve!: (xy: Float64Array) => void;
    const result = new Promise<Float64Array>((r) => (resolve = r));
    const job = { input, resolve, cancel: vi.fn() };
    jobs.push(job);
    return { result, cancel: job.cancel };
  },
}));

function node(id: string, neighborIds: string[]): NodeSummary {
  return { id, publicKey: id, nodeType: 2, nodeTypeName: "repeater", name: id, lat: 45, lng: -75, iatas: ["YVR"], neighborIds } as NodeSummary;
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><NeighbourGraphTab /></QueryClientProvider>);
}

beforeEach(() => {
  region.iatas = ["YVR"]; region.regionKey = "YVR";
  Object.assign(nodes, { nodes: [], loadedCount: 0, isPaging: false, isError: false });
  jobs.length = 0;
  graphProps.last = null;
});

// a ring of n nodes, big enough to take the worker path
function mesh(prefix: string, n: number): NodeSummary[] {
  return Array.from({ length: n }, (_, i) => ({
    ...node(`${prefix}${String(i).padStart(4, "0")}`, [`${prefix}${String((i + 1) % n).padStart(4, "0")}`]),
    knownNeighborCount: 2,
  }));
}
const positions = (n: number, k: number) => Float64Array.from({ length: 2 * n }, (_, i) => i * k);
const series = () => {
  const s = graphProps.last!.option.series;
  return (Array.isArray(s) ? s[0] : s) as { layout: string; data: GraphNode[] };
};

it("asks for a region in French when All is selected", async () => {
  region.iatas = undefined; region.regionKey = "*";
  await i18n.changeLanguage("fr");
  mount();
  expect(screen.getByText("Choisissez une région")).toBeInTheDocument();
});

it("shows French loading and empty states", async () => {
  await i18n.changeLanguage("fr");
  Object.assign(nodes, { isPaging: true, loadedCount: 3 });
  const view = mount();
  expect(screen.getByText("Chargement du réseau…")).toBeInTheDocument();
  expect(screen.getByText("3 nœuds")).toBeInTheDocument();
  Object.assign(nodes, { isPaging: false });
  view.rerender(<QueryClientProvider client={new QueryClient()}><NeighbourGraphTab /></QueryClientProvider>);
  expect(screen.getByText("Aucun nœud dans cette région")).toBeInTheDocument();
});

it("counts the full mesh in French", async () => {
  await i18n.changeLanguage("fr");
  Object.assign(nodes, { nodes: [node("a", ["b"]), node("b", ["a"])] });
  mount();
  expect(screen.getByText("2 nœuds")).toBeInTheDocument();
});

const grey = new Proxy({}, { get: () => "#888888" }) as ChartColors;

it("translates the graph legend", async () => {
  await i18n.changeLanguage("fr");
  const option = neighbourGraphOption({ nodes: [], links: [], total: 0, capped: false }, grey, i18n.t);
  const legend = Array.isArray(option.legend) ? option.legend[0] : option.legend;
  expect(legend?.data).toEqual(["Compagnon", "Répéteur", "Salon", "Capteur", "Autre"]);
});

it("lays a big mesh out in the worker, then draws it at the fixed positions", async () => {
  await i18n.changeLanguage("en");
  Object.assign(nodes, { nodes: mesh("a", 600), loadedCount: 600 });
  mount();
  expect(screen.getByText("Loading mesh…")).toBeInTheDocument();
  expect(graphProps.last).toBeNull();
  expect(jobs).toHaveLength(1);
  expect(jobs[0]!.input.count).toBe(600);
  expect(jobs[0]!.input.source).toHaveLength(600);

  await act(async () => jobs[0]!.resolve(positions(600, 1)));
  expect(screen.queryByText("Loading mesh…")).not.toBeInTheDocument();
  expect(series().layout).toBe("none");
  expect(series().data[3]).toMatchObject({ x: 6, y: 7 });
  expect(graphProps.last!.nodes[3]).toMatchObject({ x: 6, y: 7 });
});

it("waits for the pager before starting a layout", () => {
  Object.assign(nodes, { nodes: mesh("a", 600), loadedCount: 600, isPaging: true });
  mount();
  expect(jobs).toHaveLength(0);
});

it("drops a stale layout when the region changes mid-run", async () => {
  await i18n.changeLanguage("en");
  Object.assign(nodes, { nodes: mesh("a", 600), loadedCount: 600 });
  const view = mount();
  expect(jobs).toHaveLength(1);

  region.regionKey = "YYZ";
  Object.assign(nodes, { nodes: mesh("b", 700), loadedCount: 700 });
  view.rerender(<QueryClientProvider client={new QueryClient()}><NeighbourGraphTab /></QueryClientProvider>);
  expect(jobs[0]!.cancel).toHaveBeenCalled();
  expect(jobs).toHaveLength(2);

  // the old region's result lands late and is ignored
  await act(async () => jobs[0]!.resolve(positions(600, 1)));
  expect(screen.getByText("Loading mesh…")).toBeInTheDocument();
  expect(graphProps.last).toBeNull();

  await act(async () => jobs[1]!.resolve(positions(700, 2)));
  expect(series().data).toHaveLength(700);
  expect(series().data[0]).toMatchObject({ x: 0, y: 2 });
});

it("stops the layout when the tab unmounts", () => {
  Object.assign(nodes, { nodes: mesh("a", 600), loadedCount: 600 });
  const view = mount();
  view.unmount();
  expect(jobs[0]!.cancel).toHaveBeenCalled();
});

it("keeps a small mesh on the chart's own force layout", async () => {
  Object.assign(nodes, { nodes: mesh("a", 40), loadedCount: 40 });
  mount();
  expect(jobs).toHaveLength(0);
  expect(series().layout).toBe("force");
});
