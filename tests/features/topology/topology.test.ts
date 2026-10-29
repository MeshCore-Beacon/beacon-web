import { describe, it, expect, vi } from "vitest";
import { buildTopology, reportFromEvent, LiveTraffic, project, createProjector, fitCamera, panCamera, pathControls, visibleLinks, DEFAULT_CAMERA, linkContext, loadTopology, loadTopologyRoutes, NODE_CAP, FLOW_CAP, REPORT_CAP } from "../../../src/features/topology/topology";
import { getTopologyLinks, getNodesPage } from "../../../src/api/client";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { WsPacketObservation } from "../../../src/types/ws";
import type { KnownRoute, ResolvedHop } from "../../../src/types/api";

vi.mock("../../../src/api/client", () => ({ getNodesPage: vi.fn(), getTopologyLinks: vi.fn() }));
const node = (id: string, region = "YOW", scope = "#on"): NodeSummary => ({ id, publicKey: id.repeat(64), name: id, nodeType: 2, nodeTypeName: "repeater", lat: null, lng: null, iatas: [{ iata: region, lastHeard: 1 }], knownNeighborCount: 1, neighborIds: [], defaultScope: scope });
const a = { ...node("a"), neighborIds: ["b", "b", "a", "missing"] }, b = { ...node("b", "YKF"), neighborIds: ["a"] }, c = node("c");
const graph = buildTopology([a, b, c]);
const hop = (id: string): ResolvedHop => ({ confidence: "high", nodes: [{ id, publicKey: id }] });
const event = (path: ResolvedHop[] = [hop("a"), hop("b"), hop("c")]): WsPacketObservation["data"] => ({ packetHash: "hash", packet: { payloadType: 5, payloadTypeName: "GRP_TXT", routeType: 1, routeTypeName: "FLOOD", isFirstObservation: true, observationCount: 1, scope: "#on" }, observation: { observerId: "obs", observerName: "Observer", iata: "YOW", heardAt: 1, rssi: -90, snr: 5, sourceBroker: "fixture", resolvedPath: path } });

describe("3D topology evidence and bounds", () => {
  it("requests larger pages without skipping a legacy server's smaller pages", async () => {
    const signal = new AbortController().signal;
    vi.mocked(getNodesPage).mockReset()
      .mockResolvedValueOnce({ items: [a], hasMore: true, nextCursor: 17 })
      .mockResolvedValueOnce({ items: [b], hasMore: false, nextCursor: null });
    expect(await loadTopology(undefined, signal)).toEqual({ nodes: [a, b], capped: false });
    expect(getNodesPage).toHaveBeenNthCalledWith(2, undefined,
      { cursor: 17, pageCursor: undefined, limit: 2000, neighbors: true }, signal);
    vi.mocked(getNodesPage).mockReset();
  });
  it("animates repeated hearings once while retaining reports and distinct paths", () => {
    const traffic = new LiveTraffic(), report = reportFromEvent(event(),graph,1000)!;
    traffic.add(report);
    traffic.add({...report,key:"hash|other",observerId:"other",at:1100});
    expect(traffic.reports).toHaveLength(2);expect(traffic.flows).toHaveLength(1);
    traffic.add({...report,key:"hash|another",observerId:"another",at:1200,segments:[["a","c"]]});
    expect(traffic.flows).toHaveLength(2);expect(traffic.trails.size).toBe(3);
    traffic.add({...report,key:"hash|later",observerId:"later",at:5300});
    expect(traffic.flows).toHaveLength(2);
    traffic.clearFlows();
    traffic.add({...report,key:"hash|visible",at:5400});
    expect(traffic.flows).toHaveLength(1);
  });
  it("expires out-of-order receipts and trails after a clock adjustment", () => {
    const live = new LiveTraffic();
    const report = reportFromEvent(event(), graph, 2000)!;
    live.add({ ...report, key: "newer", at: 2000, segments: [["a", "b"]] });
    live.add({ ...report, key: "older", at: 1000, segments: [["b", "c"]] });
    live.prune(61000);
    expect(live.reports.map(r => r.key)).toEqual(["newer"]);
    expect([...live.trails.keys()]).toEqual(["a|b"]);
    expect(live.flows).toEqual([]);
    expect(live.add({ ...report, key: "older", at: 61000 })).toBe(true);
  });

  it("does not replace retained history arrays when no observations have expired", () => {
    const live = new LiveTraffic();
    const reports = live.reports, flows = live.flows;
    for (let i = 0; i < 100; i++) live.add({ ...reportFromEvent(event(), graph, 1000 + i)!, key: String(i), hash: String(i) });
    live.prune(1200);
    expect(live.reports).toBe(reports);
    expect(live.flows).toBe(flows);
    expect(live.reports).toHaveLength(100);
    expect(live.flows).toHaveLength(100);
  });

  it("projects all vertices with the same perspective as the original camera equations", () => {
    for (const yaw of [-1.5, 0, 1.2]) for (const pitch of [0.35, 1.05, Math.PI / 2]) {
      const camera = { yaw, pitch, zoom: 2.4, target: { x: 50, y: 12, z: -80 } };
      const render = createProjector(camera, 1280, 720, 800);
      for (const point of [{x:0,y:0,z:0},{x:900,y:28,z:-400},{x:-300,y:400,z:-6000}]) {
        const lx=point.x-50, ly=point.y-12, lz=point.z+80;
        const x=lx*Math.cos(yaw)-lz*Math.sin(yaw), z=lx*Math.sin(yaw)+lz*Math.cos(yaw);
        const y=ly*Math.cos(pitch)+z*Math.sin(pitch), depth=-ly*Math.sin(pitch)+z*Math.cos(pitch);
        const perspective=2400/(2400+depth), scale=720/(800*2.6)*2.4*perspective;
        expect(render(point)).toEqual({x:640+x*scale,y:360-y*scale,depth,scale,visible:perspective>0});
      }
    }
  });
  it("groups nodes within the selected shared regions despite a newer outside reception", () => {
    const multi = { ...a, iatas: [{ iata: "YYZ", lastHeard: 30 }, { iata: "YOW", lastHeard: 20 }, { iata: "YKF", lastHeard: 10 }] };
    expect(buildTopology([multi], ["YOW", "YKF"]).nodes[0]!.region).toBe("YOW");
    expect(buildTopology([multi], ["YKF"]).nodes[0]!.region).toBe("YKF");
    expect(buildTopology([multi]).nodes[0]!.region).toBe("YYZ");
  });
  it("keeps unlocated identities and only supplied neighbour edges, with stable positions", () => {
    expect(graph.nodes).toHaveLength(3);
    expect(graph.links).toEqual([["a", "b"]]);
    expect(buildTopology([c, b, a]).nodes).toEqual(graph.nodes);
    expect(graph.nodes.every(n => n.y >= 0 && n.y <= 28)).toBe(true);
    expect(linkContext(graph.byId.get("a")!, graph.byId.get("b")!)).toEqual({ crossRegion: true, sharedDefault: "#on" });
    expect(linkContext(graph.byId.get("a")!, { ...graph.byId.get("b")!, defaultScope: "#ON" }).sharedDefault).toBeNull();
  });
  it("does not bridge ambiguous, unloaded, or missing hops, or append reporting observers", () => {
    expect(reportFromEvent(event(), graph, 100)?.segments).toEqual([["a", "b"], ["b", "c"]]);
    for (const middle of [{ confidence: "ambiguous", nodes: [hop("b").nodes[0]!, hop("c").nodes[0]!] } as ResolvedHop, hop("missing"), { confidence: "none", nodes: [] } as ResolvedHop]) {
      const report = reportFromEvent(event([hop("a"), middle, hop("c")]), graph, 100)!;
      expect(report.segments).toEqual([]); expect(report.partial).toBe(true);
    }
    const missing = event(); delete missing.observation.resolvedPath;
    expect(reportFromEvent(missing, graph, 100)?.segments).toEqual([]);
    const repeat = event(); repeat.packet.isRepeat = true;
    expect(reportFromEvent(repeat, graph, 100)).toBeNull();
    const unknown = event(); unknown.packet.payloadType = 99;
    expect(reportFromEvent(unknown, graph, 100)?.kind).toBe("other");
  });
  it("deduplicates packet/observer pairs in the live window and bounds report/animation memory", () => {
    const traffic = new LiveTraffic();
    const report = reportFromEvent(event(), graph, 100)!;
    expect(traffic.add(report)).toBe(true); expect(traffic.add({ ...report, at: 200 })).toBe(false);
    expect(traffic.add({ ...report, key: "hash|other", observerId: "other", at: 200 })).toBe(true);
    for (let i = 0; i < REPORT_CAP + 10; i++) traffic.add({ ...report, key: `event${i}`, hash: `event${i}`, at: 300 });
    expect(traffic.reports).toHaveLength(REPORT_CAP); expect(traffic.flows).toHaveLength(FLOW_CAP); expect(traffic.cappedUntil).toBeGreaterThan(300);
    expect(traffic.trails.size).toBe(2);
    traffic.prune(5_000); expect(traffic.flows).toEqual([]); expect(traffic.trails.size).toBe(2);
    traffic.prune(60_301); expect(traffic.reports).toEqual([]); expect(traffic.flows).toEqual([]);
    expect(traffic.trails.size).toBe(0);
    expect(traffic.add({ ...report, at: 60_302 })).toBe(true);
  });
  it("uses depth perspective and a real orbit without invalid coordinates", () => {
    const point = { x: 100, y: 20, z: 50 };
    const front = project(point, DEFAULT_CAMERA, 1000, 700, 500);
    const side = project(point, { ...DEFAULT_CAMERA, yaw: 1 }, 1000, 700, 500);
    expect(front.x).not.toBe(side.x); expect(front.depth).not.toBe(side.depth);
    expect([front.x, front.y, front.scale, side.x, side.y].every(Number.isFinite)).toBe(true);
  });
  it("looks down from above: raised nodes are closer and above their ground position", () => {
    const point = { x: 50, y: 0, z: 0 };
    const ground = project(point, DEFAULT_CAMERA, 1000, 700, 500);
    const raised = project({ ...point, y: 70 }, DEFAULT_CAMERA, 1000, 700, 500);
    expect(raised.depth).toBeLessThan(ground.depth);
    expect(raised.scale).toBeGreaterThan(ground.scale);
    expect(raised.y).toBeLessThan(ground.y);
    const top = { ...DEFAULT_CAMERA, pitch: Math.PI / 2 };
    expect(project({ ...point, y: 70 }, top, 1000, 700, 500).scale).toBeGreaterThan(project(point, top, 1000, 700, 500).scale);
  });
  it("stops on repeating cursors, passes cancellation, and bounds the expanded snapshot", async () => {
    vi.mocked(getNodesPage).mockResolvedValue({ items: [a], nextCursor: 1, hasMore: true });
    const controller = new AbortController();
    const result = await loadTopology(undefined, controller.signal);
    expect(result).toEqual({ nodes: [a], capped: true }); expect(getNodesPage).toHaveBeenCalledTimes(2);
    vi.mocked(getNodesPage).mockClear().mockImplementation(async (_iatas, params) => ({ items: [a], nextCursor: (params?.cursor ?? 0) + 1, hasMore: true }));
    await loadTopology(["YOW"], controller.signal); expect(getNodesPage).toHaveBeenCalledTimes(NODE_CAP / 200);
    controller.abort(); await expect(loadTopology(undefined, controller.signal)).rejects.toThrow();
    expect(getNodesPage).toHaveBeenCalledTimes(NODE_CAP / 200);
  });
  it("uses exact cursors across pages with the same legacy timestamp", async () => {
    vi.mocked(getNodesPage).mockReset()
      .mockResolvedValueOnce({ items: [a], nextCursor: 1, nextPageCursor: "exact-a", hasMore: true })
      .mockResolvedValueOnce({ items: [b], nextCursor: 1, nextPageCursor: "exact-b", hasMore: true })
      .mockResolvedValueOnce({ items: [c], nextCursor: null, hasMore: false });
    const controller = new AbortController();
    expect(await loadTopology(undefined, controller.signal)).toEqual({ nodes: [a, b, c], capped: false });
    expect(getNodesPage).toHaveBeenNthCalledWith(2, undefined,
      { cursor: undefined, pageCursor: "exact-a", limit: 2000, neighbors: true }, controller.signal);
    expect(getNodesPage).toHaveBeenNthCalledWith(3, undefined,
      { cursor: undefined, pageCursor: "exact-b", limit: 2000, neighbors: true }, controller.signal);
    vi.mocked(getNodesPage).mockClear().mockResolvedValue({ items: [a], nextCursor: 1, nextPageCursor: "repeat", hasMore: true });
    expect(await loadTopology(undefined, controller.signal)).toEqual({ nodes: [a], capped: true });
    expect(getNodesPage).toHaveBeenCalledTimes(2);
    vi.mocked(getNodesPage).mockReset();
  });
  it("moves linked regions closer while keeping their islands apart", () => {
    const input = Array.from({ length: 9 }, (_, i) => node(String(i), `R${i}`));
    const before = buildTopology(input), after = buildTopology(input.map(n => n.id === "0" ? { ...n, neighborIds: ["8"] } : n));
    const distance = (g: typeof graph) => Math.hypot(g.regions[0]!.x - g.regions[8]!.x, g.regions[0]!.z - g.regions[8]!.z);
    expect(distance(after)).toBeLessThan(distance(before) * 0.7);
    for (let i = 0; i < after.regions.length; i++) for (let j = 0; j < i; j++) {
      const a = after.regions[i]!, b = after.regions[j]!;
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.radius + b.radius + 40);
    }
  });
  it("keeps more than 2,000 nodes and every supplied connection visible in All paths", () => {
    const input = Array.from({ length: 2200 }, (_, i) => ({ ...node(String(i), `R${i % 11}`), neighborIds: Array.from({ length: 3 }, (_, j) => String((i + j + 1) % 2200)) }));
    const expanded = buildTopology(input);
    expect(expanded.nodes).toHaveLength(2200); expect(expanded.links).toHaveLength(6600); expect(expanded.linksCapped).toBe(false);
    expect(visibleLinks(expanded, "all", "R0", "0")).toHaveLength(6600);
    const bundled = buildTopology([a, b, c]); expect(bundled.bundles).toEqual([{ from: "YKF", to: "YOW", count: 1 }]);
    expect(visibleLinks(bundled, "selected", "", "a")).toEqual([["a", "b"]]);
  });
  it("fits distant regions in portrait and landscape and pans around the fitted target", () => {
    const points = [{ x: 3000, y: 0, z: -120 }, { x: 3300, y: 40, z: 140 }];
    for (const [width, height] of [[390, 450], [1200, 600]]) {
      const camera = fitCamera(points, DEFAULT_CAMERA, width!, height!, 4000);
      for (const point of points) { const q = project(point, camera, width!, height!, 4000); expect(q.x).toBeGreaterThanOrEqual(49); expect(q.x).toBeLessThanOrEqual(width! - 49); expect(q.y).toBeGreaterThanOrEqual(49); expect(q.y).toBeLessThanOrEqual(height! - 49); }
      const q = project(camera.target, camera, width!, height!, 4000); expect(q.x).toBe(width! / 2); expect(q.y).toBe(height! / 2);
      const moved = project(camera.target, panCamera(camera, 30, 20, width!, height!, 4000), width!, height!, 4000);
      expect(moved.x).toBeGreaterThan(q.x); expect(moved.y).toBeGreaterThan(q.y);
    }
    const curve = pathControls(points[0]!, points[1]!, true); expect(curve[0]).toEqual(points[0]); expect(curve[3]).toEqual(points[1]); expect(curve[1].y).toBeGreaterThan(100);
  });
  it("adds adjacent saved-route segments without bridging missing identities", async () => {
    const route = (id: number, ids: string[], lastSeen: number): KnownRoute => ({ id, iata: "YOW", hopCount: ids.length, hops: ids.map(nodeId => ({ nodeId, hashBytes: "aa" })), firstSeen: 0, lastSeen, observationCount: 1 });
    const routes = [route(1, ["b", "c"], 100_000_000), route(2, ["a", "missing", "c"], 100_000_000)];
    const withRoutes = buildTopology([a, b, c], "", routes);
    expect(withRoutes.links).toEqual([["a", "b"], ["b", "c"]]); expect([...withRoutes.routeLinks]).toEqual(["b|c"]);
    vi.mocked(getTopologyLinks).mockResolvedValue({ links:[["b","c"]],capped:false,since:0,until:1 });
    const controller = new AbortController();
    expect(await loadTopologyRoutes(["YOW"],controller.signal)).toEqual({routes:[["b","c"]],capped:false});
    expect(getTopologyLinks).toHaveBeenCalledTimes(1);
    expect(getTopologyLinks).toHaveBeenCalledWith(["YOW"],"15m",controller.signal);
    controller.abort(); await expect(loadTopologyRoutes(undefined, controller.signal)).rejects.toThrow();
  });
  it("isolates multi-region nodes into the requested region", () => {
    const multi = { ...a, iatas: [{ iata: "YOW", lastHeard: 1 }, { iata: "YKF", lastHeard: 100 }] };
    expect(buildTopology([multi], "YOW").nodes[0]!.region).toBe("YOW");
  });
  it("loads a complete 24h snapshot in one cancellable request and preserves its cap warning", async () => {
    vi.mocked(getTopologyLinks).mockClear().mockResolvedValue({links:[["a","b"]],capped:true,since:0,until:1});
    const signal=new AbortController().signal;
    expect(await loadTopologyRoutes(undefined,signal,86_400_000)).toEqual({routes:[["a","b"]],capped:true});
    expect(getTopologyLinks).toHaveBeenCalledExactlyOnceWith(undefined,"24h",signal);
  });
  it("does not scan global routes for an empty region", async () => {
    vi.mocked(getTopologyLinks).mockClear();
    expect(await loadTopologyRoutes([], new AbortController().signal)).toEqual({ routes: [], capped: false });
    expect(getTopologyLinks).not.toHaveBeenCalled();
  });
});
