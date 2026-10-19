import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NodeTable } from "../../../src/features/nodes/NodeTable";
import { getNodesPage } from "../../../src/api/client";
import i18n from "../../../src/i18n";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { WsManager } from "../../../src/api/ws-manager";
import { stubVirtualLayout } from "../../virtual-layout";

const region = { iatas: ["YVR"], regionKey: "YVR", isResolved: true };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/hooks/useScopes", () => ({ useScopes: () => [] }));
vi.mock("../../../src/api/client", () => ({ getNodesPage: vi.fn() }));

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
  stubVirtualLayout(500, 38); // the table is virtualized
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NodeTable name column", () => {
  it("keeps the full name readable when the cell cuts it off", async () => {
    const name = "Ottawa-West Repeater (Kanata Hill) 2";
    mount([node({ id: "node-long", name })]);
    expect(await screen.findByText(name)).toHaveAttribute("title", name);
  });
});

describe("NodeTable name column", () => {
  it("gives an emoji in a name its own span so it can't paint over the next letter", async () => {
    mount([node({ id: "node-skull", name: "☠️Grunt031" })]);
    const glyph = await screen.findByText("☠️");
    expect(glyph).toHaveClass("emoji-glyph");
    expect(glyph.parentElement).toHaveTextContent("☠️Grunt031");
  });
});

describe("NodeTable paging", () => {
  it("asks for nodes at the server's page cap, so a whole region takes a quarter of the requests", async () => {
    mount([node({ id: "node-a", name: "Node A" })]);
    await screen.findByText("Node A");
    expect(vi.mocked(getNodesPage)).toHaveBeenCalledWith(["YVR"], expect.objectContaining({ limit: 200 }));
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

describe("NodeTable with thousands of nodes", () => {
  it("mounts only the rows on screen", async () => {
    mount(Array.from({ length: 2000 }, (_, i) => node({ id: `node-${i}`, name: `Node ${String(i).padStart(4, "0")}` })));
    await screen.findByText("Node 0000");
    expect(document.querySelectorAll("tbody tr[data-index]").length).toBeLessThan(50);
  });
});
