import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NodeTable } from "../../../src/features/nodes/NodeTable";
import { getNodesPage, getTelemetryAvailability } from "../../../src/api/client";
import i18n from "../../../src/i18n";
import type { NodePage, NodeSummary } from "../../../src/features/nodes/types";
import type { WsManager } from "../../../src/api/ws-manager";
import type { WsNodeUpdate } from "../../../src/types/ws";
import { stubVirtualLayout } from "../../virtual-layout";

const region = { iatas: ["YVR"], regionKey: "YVR", isResolved: true };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
let scopes: string[] = [];
vi.mock("../../../src/hooks/useScopes", () => ({ useScopes: () => scopes }));
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
  scopes = [];
  vi.mocked(getNodesPage).mockReset();
  vi.mocked(getTelemetryAvailability).mockReset();
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

describe("collected telemetry filter", () => {
  it("continues sorted pages when the first page has no telemetry matches", async () => {
    const key = "cd".repeat(32);
    const first = Array.from({ length: 200 }, (_, i) => node({ id: `first-${i}`, name: `Node ${i}`, publicKey: "ab".repeat(32) }));
    vi.mocked(getTelemetryAvailability).mockResolvedValue({ nodes: new Map([[key, 1792500000000]]), retentionDays: 30 });
    vi.mocked(getNodesPage).mockImplementation(async (_iatas, params) => params?.pageCursor
      ? { items: [node({ id: "later", name: "Later reporting repeater", publicKey: key })], hasMore: false, sort: "name" }
      : { items: first, hasMore: true, nextPageCursor: "later-page", sort: "name" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><NodeTable wsManager={fakeWsManager} selectedNodeId={null} onSelectNode={vi.fn()} /></QueryClientProvider>);
    await screen.findByText("Node 0");
    fireEvent.click(screen.getByRole("button", { name: /Telemetry/ }));
    fireEvent.click(screen.getByRole("option", { name: "Available" }));
    expect(await screen.findByText("Later reporting repeater")).toBeInTheDocument();
    expect(getNodesPage).toHaveBeenCalledWith(["YVR"], expect.objectContaining({ pageCursor: "later-page", sort: "name", order: "asc" }));
  });
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

describe("NodeTable IATA badge freshness", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps the last-heard label current while the rows stay the same", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    mount([node({ id: "node-fresh", name: "Fresh node", iatas: [{ iata: "YUL", lastHeard: Date.now() - 30_000 }] })]);
    const trigger = (await screen.findByText("YUL")).parentElement!;
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("last heard 30s ago");
    fireEvent.mouseLeave(trigger);
    act(() => vi.advanceTimersByTime(90_000));
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("last heard 2m ago");
  });
});

describe("NodeTable cards", () => {
  const desktop = window.matchMedia;
  afterEach(() => { window.matchMedia = desktop; });

  it("shows when a node was last heard, if the server says", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    mount([node({ id: "heard", name: "Heard node", lastSeen: Date.now() - 5 * 60_000 }), node({ id: "quiet", name: "Quiet node" })]);
    expect((await screen.findByText("Heard node")).closest("button")).toHaveTextContent("5m ago");
    expect(screen.getByText("Quiet node").closest("button")).not.toHaveTextContent("ago");
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

describe("NodeTable server order", () => {
  const sortedPage = (items: NodeSummary[], over: Partial<NodePage> = {}): NodePage =>
    ({ items, nextCursor: null, hasMore: false, sort: "name", order: "asc", ...over });

  function mountPages(answer: (params: Parameters<typeof getNodesPage>[1]) => NodePage, wsManager = fakeWsManager) {
    vi.mocked(getNodesPage).mockImplementation(async (_iatas, params) => answer(params));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NodeTable wsManager={wsManager} selectedNodeId={null} onSelectNode={vi.fn()} />
      </QueryClientProvider>,
    );
  }
  const names = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0]!.textContent);
  const header = (name: RegExp) => within(screen.getByRole("table")).queryByRole("button", { name });

  it("asks for name order and pages on scroll, showing rows in the server's order", async () => {
    mountPages((p) =>
      p?.pageCursor === "s1:next"
        ? sortedPage([node({ id: "c", name: "Charlie" })])
        : sortedPage([node({ id: "b", name: "Bravo" }), node({ id: "a", name: "alpha 10" })], { hasMore: true, nextPageCursor: "s1:next" }),
    );
    await screen.findByText("alpha 10");
    expect(vi.mocked(getNodesPage)).toHaveBeenLastCalledWith(["YVR"], expect.objectContaining({ sort: "name", order: "asc", limit: 200 }));
    expect(names()).toEqual(["Bravo", "alpha 10"]); // as given, not re-sorted here
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(vi.mocked(getNodesPage)).toHaveBeenCalledTimes(1); // no eager paging

    fireEvent.scroll(screen.getByRole("table").parentElement!);
    await screen.findByText("Charlie");
    expect(vi.mocked(getNodesPage)).toHaveBeenLastCalledWith(["YVR"], expect.objectContaining({ pageCursor: "s1:next", sort: "name" }));
    expect(names()).toEqual(["Bravo", "alpha 10", "Charlie"]);
  });

  it("asks the server again when a sortable header is clicked, and radio isn't sortable", async () => {
    mountPages((p) => sortedPage([node({ id: "a", name: `Node ${p?.sort} ${p?.order}` })], { sort: p?.sort, order: p?.order }));
    await screen.findByText("Node name asc");
    fireEvent.click(header(/type/i)!);
    await screen.findByText("Node type asc");
    fireEvent.click(header(/type/i)!);
    await screen.findByText("Node type desc");
    fireEvent.click(header(/neighbo/i)!);
    await screen.findByText("Node neighbors asc");
    expect(header(/radio/i)).not.toBeInTheDocument();
  });

  it("asks the server for the newest heard first, then the oldest", async () => {
    mountPages((p) => sortedPage([node({ id: "a", name: `Node ${p?.sort} ${p?.order}`, lastSeen: Date.now() })], { sort: p?.sort, order: p?.order }));
    await screen.findByText("Node name asc");
    fireEvent.click(header(/last heard/i)!);
    await screen.findByText("Node lastSeen desc");
    fireEvent.click(header(/last heard/i)!);
    await screen.findByText("Node lastSeen asc");
    expect(vi.mocked(getNodesPage)).toHaveBeenLastCalledWith(["YVR"], expect.objectContaining({ sort: "lastSeen", order: "asc" }));
  });

  it("hides Last heard when the server's rows don't carry it", async () => {
    mountPages(() => sortedPage([node({ id: "a", name: "Older server" })]));
    await screen.findByText("Older server");
    expect(screen.queryByRole("columnheader", { name: /last heard/i })).not.toBeInTheDocument();
  });

  it("goes back to name order if a Last heard page comes without lastSeen", async () => {
    mountPages((p) => p?.sort === "lastSeen"
      ? sortedPage([node({ id: "a", name: "No time" })], { sort: "lastSeen", order: "desc" })
      : sortedPage([node({ id: "a", name: `Node ${p?.sort}`, lastSeen: Date.now() })], { sort: p?.sort, order: p?.order }));
    await screen.findByText("Node name");
    fireEvent.click(header(/last heard/i)!);
    await waitFor(() => expect(header(/last heard/i)).not.toBeInTheDocument());
    expect(await screen.findByText("Node name")).toBeInTheDocument();
    expect(header(/name/i)).toHaveTextContent("▲");
  });

  it("moves a row's Last heard to now when its advert arrives, leaving the row where it is", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    try {
      let push: (data: WsNodeUpdate["data"]) => void = () => {};
      const ws = { onNodeUpdate: (handler: typeof push) => { push = handler; return () => {}; } } as unknown as WsManager;
      const hourAgo = Date.now() - 3_600_000;
      mountPages(() => sortedPage([node({ id: "a", name: "Alpha", lastSeen: hourAgo }), node({ id: "b", name: "Bravo", lastSeen: hourAgo - 60_000 })]), ws);
      const row = async (name: string) => (await screen.findByText(name)).closest("tr")!;
      expect(await row("Bravo")).toHaveTextContent("1h ago");
      act(() => push({ nodeId: "b", publicKey: "aabbccdd", name: "Bravo", nodeType: 2, nodeTypeName: "REPEATER", iata: "YVR", isObserver: false, iatas: [] }));
      expect(await row("Bravo")).toHaveTextContent("0s ago");
      expect(await row("Alpha")).toHaveTextContent("1h ago");
      expect(names()).toEqual(["Alpha", "Bravo"]);
      act(() => vi.advanceTimersByTime(90_000));
      expect(await row("Bravo")).toHaveTextContent("1m ago");
    } finally { vi.useRealTimers(); }
  });

  it("sends the scope filter to the server", async () => {
    scopes = ["#bc"];
    mountPages((p) => sortedPage([node({ id: "a", name: p?.scope ? `in ${p.scope}` : "any scope" })]));
    await screen.findByText("any scope");
    expect(vi.mocked(getNodesPage)).toHaveBeenLastCalledWith(["YVR"], expect.objectContaining({ scope: undefined }));
    fireEvent.click(screen.getAllByRole("button", { name: /scope/i })[0]!);
    fireEvent.click(await screen.findByRole("option", { name: "#bc" }));
    await screen.findByText("in #bc");
  });

  it("loads every page and sorts here when the server doesn't sort (before 2.1)", async () => {
    mountPages((p) =>
      p?.pageCursor === "v1:2"
        ? { items: [node({ id: "a", name: "Alpha", radio: "910.525,62.5,7" })], nextCursor: null, hasMore: false }
        : { items: [node({ id: "z", name: "Zulu", radio: "869.618,62.5,8" })], nextCursor: 2, nextPageCursor: "v1:2", hasMore: true },
    );
    await screen.findByText("Alpha"); // the second page came without a scroll
    expect(names()).toEqual(["Alpha", "Zulu"]);
    expect(vi.mocked(getNodesPage)).toHaveBeenLastCalledWith(["YVR"], expect.objectContaining({ sort: undefined }));
    expect(header(/last heard/i)).not.toBeInTheDocument();
    fireEvent.click(header(/radio/i)!);
    expect(names()).toEqual(["Zulu", "Alpha"]);
  });
});
