import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NeighbourGraphTab } from "../../../src/features/stats/NeighbourGraphTab";
import { neighbourGraphOption } from "../../../src/features/stats/neighbour-graph";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { ChartColors } from "../../../src/features/stats/chartTheme";
import i18n from "../../../src/i18n";

const region = { iatas: ["YVR"] as string[] | undefined, regionKey: "YVR" };
const nodes = { nodes: [] as NodeSummary[], loadedCount: 0, isPaging: false, isError: false };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/features/map/useMapNodesData", () => ({ useMapNodesData: () => nodes }));
vi.mock("../../../src/features/stats/NeighbourGraph", () => ({ NeighbourGraph: () => null }));
vi.mock("../../../src/api/client", () => ({ getNodeNeighbors: vi.fn() }));

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
});

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
