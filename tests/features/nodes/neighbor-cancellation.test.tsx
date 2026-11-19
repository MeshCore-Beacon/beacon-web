import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { WsManager } from "../../../src/api/ws-manager";
import type { Node, NodeSummary } from "../../../src/features/nodes/types";
import { NodeDetailPanel } from "../../../src/features/nodes/NodeDetailPanel";
import { MapView } from "../../../src/features/map/MapView";
import { NeighbourGraphTab } from "../../../src/features/stats/NeighbourGraphTab";

const node: Node = { id: "a", publicKey: "aa", name: "a", nodeType: 2, nodeTypeName: "repeater", lat: 43, lng: -80, iatas: ["YKF"], locationSource: null, lastAdvertAt: null, supportsMultibytePaths: false, supportsMultibyteTraces: false, minFirmwareVersion: null, firstSeen: 1, lastSeen: 2, metadata: null };
const nodes: NodeSummary[] = [{ ...node, neighborIds: ["b"] }, { ...node, id: "b", name: "b", neighborIds: ["a"] }];

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../src/api/client")>(),
  getNode: async (id: string) => ({ ...node, id, name: id }),
  getNodeObservations: async () => ({ items: [], nextCursor: null, hasMore: false }),
  getIatas: async () => [],
}));
vi.mock("../../../src/features/map/useMapLibre", () => ({ useMapLibre: () => ({ containerRef: { current: null }, mapRef: { current: null }, isReady: false, error: null, nodeIconResolverRef: { current: null } }) }));
vi.mock("../../../src/features/map/useMapNodes", () => ({ useMapNodes: () => {} }));
vi.mock("../../../src/features/map/useMapNeighbors", () => ({ useMapNeighbors: () => {} }));
vi.mock("../../../src/features/map/useMapBorders", () => ({ useMapBorders: () => {} }));
vi.mock("../../../src/features/map/useMapPacketFlow", () => ({ useMapPacketFlow: () => {} }));
vi.mock("../../../src/features/map/useMapBordersData", () => ({ useMapBordersData: () => ({ type: "FeatureCollection", features: [] }) }));
vi.mock("../../../src/features/map/useMapNodesData", () => ({ useMapNodesData: () => ({ nodes, loadedCount: 2, isPaging: false, isError: false }) }));
vi.mock("../../../src/features/map/useMapTelemetry", () => ({ useMapTelemetry: () => new Map() }));
vi.mock("../../../src/hooks/useFeatures", () => ({ useFeatures: () => ({ polling: false, accounts: "off", mapTelemetry: false }), useDisplayUnits: () => ({ temperature: "c", distance: "metric" }) }));
vi.mock("../../../src/hooks/useTelemetryRequests", () => ({ useRequestsAvailable: () => false }));
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => ({ iatas: ["YKF"], regionKey: "YKF", isResolved: true }), useRegionSelection: () => ({ selection: { regions: [], iatas: ["YKF"] } }) }));
vi.mock("../../../src/hooks/useTheme", () => ({ useTheme: () => ({ themeId: "default", themes: [] }) }));
vi.mock("../../../src/hooks/useWsHandlers", () => ({ useWsNodeUpdateHandler: () => {} }));
vi.mock("../../../src/features/stats/NeighbourGraph", () => ({
  NeighbourGraph: ({ onSelect }: { onSelect: (id: string) => void }) => <div>
    <button onClick={() => onSelect("a")}>select a</button>
    <button onClick={() => onSelect("b")}>select b</button>
  </div>,
}));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => null }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const requests: { id: string; aborted: boolean; respond: () => void }[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const match = new URL(url).pathname.match(/\/nodes\/([^/]+)\/neighbors$/);
    if (!match) throw new Error(`Unexpected request: ${url}`);
    const request = { id: match[1], aborted: false, respond: () => resolve(new Response("[]")) };
    init?.signal?.addEventListener("abort", () => {
      request.aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
    requests.push(request);
  })));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={["/?tab=Map&neighbor_lines=selected"]}>{children}</MemoryRouter>
  </QueryClientProvider>;
  return { client, requests, wrapper };
}
function view(kind: string, id: string) {
  if (kind === "panel") return <NodeDetailPanel nodeId={id} onClose={() => {}} onViewObserver={() => {}} />;
  if (kind === "map") return <MapView wsManager={{} as WsManager} selectedNodeId={id} onSelectNode={() => {}} />;
  return <NeighbourGraphTab />;
}
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("shared selected-neighbor cancellation", () => {
  it.each(["panel", "map", "graph"])("stops obsolete %s reads when selection changes or the view leaves", async (kind) => {
    const { requests, wrapper } = setup();
    const current = render(view(kind, "a"), { wrapper });
    if (kind === "graph") fireEvent.click(screen.getByRole("button", { name: "select a" }));
    await waitFor(() => expect(requests.map((r) => r.id)).toEqual(["a"]));
    if (kind === "graph") fireEvent.click(screen.getByRole("button", { name: "select b" }));
    else current.rerender(view(kind, "b"));
    await waitFor(() => expect(requests.map((r) => r.id)).toEqual(["a", "b"]));
    expect(requests[0].aborted).toBe(true);
    expect(requests[1].aborted).toBe(false);
    current.unmount();
    expect(requests[1].aborted).toBe(true);
  });

  it("keeps a map's shared request alive when its panel closes, then reuses the completed cache", async () => {
    const { client, requests, wrapper } = setup();
    const ui = (panel: boolean) => <>{panel && view("panel", "a")}{view("map", "a")}</>;
    const current = render(ui(true), { wrapper });
    await waitFor(() => expect(requests).toHaveLength(1));
    current.rerender(ui(false));
    expect(requests[0].aborted).toBe(false);
    requests[0].respond();
    await waitFor(() => expect(client.getQueryData(["node-neighbors", "a"])).toEqual([]));
    current.rerender(ui(true));
    expect(requests).toHaveLength(1);
  });
});
