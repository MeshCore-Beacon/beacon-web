import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NodeTable } from "../../../src/features/nodes/NodeTable";
import { getNodesPage, getTelemetryAvailability } from "../../../src/api/client";
import i18n from "../../../src/i18n";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { WsManager } from "../../../src/api/ws-manager";

const region = { iatas: ["YVR"], regionKey: "YVR", isResolved: true };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/hooks/useScopes", () => ({ useScopes: () => [] }));
vi.mock("../../../src/api/client", () => ({ getNodesPage: vi.fn(), getTelemetryAvailability: vi.fn() }));

const fakeWsManager = { onNodeUpdate: () => () => {} } as unknown as WsManager;

const node = (over: Partial<NodeSummary>): NodeSummary => ({
  id: "node-a",
  publicKey: "aabbccdd",
  nodeType: 2,
  nodeTypeName: "REPEATER",
  name: "Node A",
  lat: null,
  lng: null,
  iatas: [],
  knownNeighborCount: 0,
  ...over,
});

function mount(items: NodeSummary[]) {
  vi.mocked(getNodesPage).mockResolvedValue({ items, nextCursor: null, hasMore: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NodeTable wsManager={fakeWsManager} selectedNodeId={null} onSelectNode={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getNodesPage).mockReset();
  vi.mocked(getTelemetryAvailability).mockReset();
});

describe("collected telemetry filter", () => {
  it("loads one availability index only on demand and matches full repeater keys", async () => {
    const key = "ab".repeat(32);
    vi.mocked(getTelemetryAvailability).mockResolvedValue({nodes: new Map([[key, 1792500000000]]), retentionDays: 30});
    mount([
      node({ id: key, publicKey: key.toUpperCase(), name: "Reporting repeater" }),
      node({ id: "other", publicKey: "ac".repeat(32), name: "No telemetry" }),
      node({ id: "companion", nodeType: 1, publicKey: key, name: "Companion" }),
    ]);
    await screen.findByText("Reporting repeater");
    expect(getTelemetryAvailability).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: /Telemetry/}));
    fireEvent.click(screen.getByRole("option", {name: "Available"}));
    await screen.findByText(/last 30 days/);
    expect(screen.getByText("Reporting repeater")).toBeInTheDocument();
    expect(screen.queryByText("No telemetry")).not.toBeInTheDocument();
    expect(screen.queryByText("Companion")).not.toBeInTheDocument();
    expect(getTelemetryAvailability).toHaveBeenCalledTimes(1);
  });

  it("reports unavailable intake instead of claiming there are no matching nodes", async () => {
    vi.mocked(getTelemetryAvailability).mockRejectedValue(new Error("unavailable"));
    mount([node({name:"Visible before filtering"})]);
    await screen.findByText("Visible before filtering");
    fireEvent.click(screen.getByRole("button", {name: /Telemetry/}));
    fireEvent.click(screen.getByRole("option", {name: "Available"}));
    await screen.findByText(/Telemetry availability could not be loaded/);
    expect(screen.queryByText("No nodes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Retry"})).toBeInTheDocument();
  });
});

describe("NodeTable location column", () => {
  it("shows a dash for an explicit 0/0 advert reset, not the coordinates", async () => {
    mount([node({ id: "node-zero", name: "Zeroed node", lat: 0, lng: 0 })]);
    const nameCell = await screen.findByText("Zeroed node");
    const row = nameCell.closest("tr")!;
    const cells = within(row).getAllByRole("cell");
    expect(cells[cells.length - 1]).toHaveTextContent("—");
    expect(screen.queryByText("0.00, 0.00")).not.toBeInTheDocument();
  });

  it("still shows coordinates when only one axis is zero", async () => {
    mount([node({ id: "node-partial", name: "Partial node", lat: 0, lng: 10 })]);
    await screen.findByText("Partial node");
    expect(screen.getByText("0.00, 10.00")).toBeInTheDocument();
  });
});

describe("NodeTable IATA badge tooltip", () => {
  it("shows a translated last-heard label, in English and French", async () => {
    const lastHeard = Date.now() - 7 * 86_400_000;
    mount([node({ id: "node-iata", name: "IATA node", iatas: [{ iata: "YOW", lastHeard }] })]);
    const badge = await screen.findByText("YOW");
    const trigger = badge.parentElement!;

    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("last heard 7d ago");
    fireEvent.mouseLeave(trigger);

    await i18n.changeLanguage("fr");
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("dernier contact il y a 7 j");
  });
});

describe("NodeTable in French", () => {
  it("translates column headers and filter labels", async () => {
    await i18n.changeLanguage("fr");
    mount([node({ id: "node-fr", name: "Nœud FR" })]);
    await screen.findByText("Nœud FR");
    for (const header of ["Nom", "Zones", "Voisins", "Position"]) {
      expect(screen.getByRole("columnheader", { name: new RegExp(header) })).toBeInTheDocument();
    }
    expect(screen.getByRole("toolbar", { name: "Filtres des nœuds" })).toHaveTextContent("Chemins multi-octets");
    expect(screen.getByRole("toolbar")).toHaveTextContent("Indifférent");
  });

  it("shows the French empty state", async () => {
    await i18n.changeLanguage("fr");
    mount([]);
    expect(await screen.findByText("Aucun nœud")).toBeInTheDocument();
  });
});
