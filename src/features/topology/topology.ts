import type { ChartColors } from "../stats/chartTheme";
import { getTopologyLinks, getNodesPage } from "../../api/client";
import type { NodeSummary } from "../nodes/types";
import type { KnownRoute, ResolvedHop } from "../../types/api";
import type { WsPacketObservation } from "../../types/ws";

export const NODE_CAP = 20_000;
export const LINK_CAP = 100_000;
export const REPORT_CAP = 10_000;
export const FLOW_CAP = 512;
export const ROUTE_CAP = 60_000;
export const ROUTE_WINDOWS = { "15m": 900_000, "1h": 3_600_000, "24h": 86_400_000 } as const;
export const LIVE_WINDOW = 60_000;
export const FLOW_MS = 4200;
export type Point3 = { x: number; y: number; z: number };
export type TopologyNode = NodeSummary & Point3 & { region: string };
export type TopologyRegion = Point3 & { code: string; count: number; radius: number };
export type Topology = { nodes: TopologyNode[]; byId: Map<string, TopologyNode>; links: [string, string][]; routeLinks: Set<string>; regions: TopologyRegion[]; bundles: { from: string; to: string; count: number }[]; linksCapped: boolean };
export type PathDisplay = "bundled" | "all" | "selected";
export type PacketKind = "advert" | "text" | "trace" | "ack" | "other";
export type LiveReport = { key: string; hash: string; observerId: string; observerName: string; iata: string; at: number; heardAt: number; kind: PacketKind; scope: string; snr: number | null; segments: [string, string][]; partial: boolean };

// Bounded, sequential, cancellable pages; no query per node or live packet.
export async function loadTopology(iatas: string[] | undefined, signal: AbortSignal) {
  const nodes = new Map<string, NodeSummary>();
  const cursors = new Set<number>();
  let cursor: number | undefined;
  for (let page = 0; page < NODE_CAP / 200; page++) {
    signal.throwIfAborted();
    const result = await getNodesPage(iatas, { cursor, limit: 200, neighbors: true }, signal);
    for (const node of result.items) if (nodes.size < NODE_CAP) nodes.set(node.id, node);
    if (!result.hasMore) return { nodes: [...nodes.values()], capped: false };
    if (result.nextCursor == null || cursors.has(result.nextCursor)) break;
    cursor = result.nextCursor;
    cursors.add(cursor);
  }
  return { nodes: [...nodes.values()], capped: true };
}

export async function loadTopologyRoutes(iatas: string[] | undefined, signal: AbortSignal, window = ROUTE_WINDOWS["15m"] as number) {
  signal.throwIfAborted();
  if (iatas?.length === 0) return { routes: [], capped: false };
  const key = Object.entries(ROUTE_WINDOWS).find(([,value])=>value===window)?.[0];
  if (!key) throw new Error("Unsupported topology window");
  const result = await getTopologyLinks(iatas,key,signal);
  return {routes:result.links,capped:result.capped};
}

export function buildTopology(input: NodeSummary[], selectedIatas: string | readonly string[] = "", routes: (KnownRoute | [string,string])[] = []): Topology {
  const allowed = typeof selectedIatas === "string" ? (selectedIatas ? [selectedIatas] : undefined) : selectedIatas;
  const groups = new Map<string, NodeSummary[]>();
  const unique = [...new Map(input.slice(0, NODE_CAP).map(n => [n.id, n])).values()];
  for (const node of unique) {
    const memberships = allowed ? node.iatas.filter(i => allowed.includes(i.iata)) : node.iatas;
    const code = [...memberships].sort((a, b) => b.lastHeard - a.lastHeard || a.iata.localeCompare(b.iata))[0]?.iata || "?";
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code)!.push(node);
  }
  const ordered = [...groups].sort(([a], [b]) => a.localeCompare(b));
  const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
  const radii = ordered.map(([, members]) => Math.max(85, 14 * Math.sqrt(members.length) + 28));
  const columnWidths = Array.from({ length: columns }, (_, c) => Math.max(0, ...radii.filter((_, i) => i % columns === c)) * 2 + 120);
  const rowHeights = Array.from({ length: Math.ceil(ordered.length / columns) }, (_, r) => Math.max(...radii.slice(r * columns, (r + 1) * columns)) * 2 + 120);
  const centerAt = (sizes: number[], index: number) => sizes.slice(0, index).reduce((a, b) => a + b, 0) + sizes[index]! / 2 - sizes.reduce((a, b) => a + b, 0) / 2;
  const nodes: TopologyNode[] = [];
  const regions: Topology["regions"] = [];
  ordered.forEach(([code, members], regionIndex) => {
    const center = { x: centerAt(columnWidths, regionIndex % columns), y: 0, z: centerAt(rowHeights, Math.floor(regionIndex / columns)) };
    regions.push({ ...center, radius: radii[regionIndex]!, code, count: members.length });
    members.sort((a, b) => b.knownNeighborCount - a.knownNeighborCount || a.id.localeCompare(b.id));
    members.forEach((node, i) => {
      // A sunflower disc gives every identity space; shallow height keeps the 3D
      // view readable instead of projecting a dense sphere onto itself.
      const radius = 14 * Math.sqrt(i);
      const angle = i * Math.PI * (3 - Math.sqrt(5));
      nodes.push({ ...node, region: code, x: center.x + Math.cos(angle) * radius, y: node.isObserver ? 28 : 4 + Math.min(16, node.knownNeighborCount * 2), z: center.z + Math.sin(angle) * radius });
    });
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links: [string, string][] = [];
  const routeLinks = new Set<string>();
  const seen = new Set<string>();
  let linksCapped = false;
  for (const node of nodes) for (const other of node.neighborIds ?? []) {
    if (node.id === other || !byId.has(other)) continue;
    const pair = [node.id, other].sort() as [string, string];
    const key = pair.join("|");
    if (seen.has(key)) continue;
    if (links.length >= LINK_CAP) { linksCapped = true; break; }
    seen.add(key);
    links.push(pair);
  }
  const routePairs: [string,string][] = routes.flatMap(route => Array.isArray(route) ? [route] : route.hops.slice(1).map((hop,i) => [route.hops[i]!.nodeId,hop.nodeId] as [string,string]));
  for (const [a,b] of routePairs) {
    // Never remove a missing hop and connect the identities on either side.
    if (a === b || !byId.has(a) || !byId.has(b)) continue;
    const pair = [a, b].sort() as [string, string], key = pair.join("|");
    if (!seen.has(key)) {
      if (links.length >= LINK_CAP) { linksCapped = true; continue; }
      seen.add(key); links.push(pair);
    }
    routeLinks.add(key);
  }
  const bundles = new Map<string, Topology["bundles"][number]>();
  for (const [a, b] of links) {
    const [from, to] = [byId.get(a)!.region, byId.get(b)!.region].sort();
    if (from === to) continue;
    const key = `${from}|${to}`, old = bundles.get(key);
    if (old) old.count++; else bundles.set(key, { from: from!, to: to!, count: 1 });
  }
  // Layout runs only when the bounded snapshot changes, never on animation frames.
  // Springs use actual neighbour edges; no scope or geographic inference creates links.
  const regionIndex = new Map(regions.map((r, i) => [r.code, i]));
  const oldCenters = regions.map(r => ({ x: r.x, z: r.z }));
  relaxPositions(regions, regions.map(r => r.radius), [...bundles.values()].map(b => [regionIndex.get(b.from)!, regionIndex.get(b.to)!, b.count]), 90, 100);
  for (const node of nodes) {
    const index = regionIndex.get(node.region)!;
    node.x += regions[index]!.x - oldCenters[index]!.x;
    node.z += regions[index]!.z - oldCenters[index]!.z;
  }
  const local = new Map(regions.map(r => [r.code, { nodes: [] as TopologyNode[], edges: [] as [number, number, number][] }]));
  const indices = new Map<string, number>();
  for (const node of nodes) { const group = local.get(node.region)!; indices.set(node.id, group.nodes.length); group.nodes.push(node); }
  for (const [a, b] of links) if (byId.get(a)!.region === byId.get(b)!.region) local.get(byId.get(a)!.region)!.edges.push([indices.get(a)!, indices.get(b)!, 1]);
  for (const region of regions) { const group = local.get(region.code)!; relaxPositions(group.nodes, group.nodes.map(() => 7), group.edges, 5, 32, region); }
  return { nodes, byId, links, routeLinks, regions, bundles: [...bundles.values()], linksCapped };
}

function relaxPositions(points: Point3[], radii: number[], edges: [number, number, number][], gap: number, iterations: number, boundary?: TopologyRegion) {
  if (points.length < 2 || !edges.length) return;
  const cellSize = Math.max(...radii) * 2 + gap;
  for (let pass = 0; pass < iterations; pass++) {
    if (!boundary && pass < iterations - 8) for (const p of points) { p.x *= 0.982; p.z *= 0.982; }
    if (pass < iterations - 8) for (const [ai, bi, weight] of edges) {
      const a = points[ai]!, b = points[bi]!, dx = b.x - a.x, dz = b.z - a.z;
      const distance = Math.hypot(dx, dz) || 1;
      const rest = radii[ai]! + radii[bi]! + gap * (1.2 + 1 / Math.sqrt(weight));
      const force = Math.max(-8, Math.min(8, (distance - rest) * 0.035));
      a.x += dx / distance * force; a.z += dz / distance * force;
      b.x -= dx / distance * force; b.z -= dz / distance * force;
    }
    // Spatial buckets avoid an all-pairs collision pass on the expanded view.
    const cells = new Map<string, number[]>();
    points.forEach((p, i) => {
      const cx = Math.floor(p.x / cellSize), cz = Math.floor(p.z / cellSize);
      for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) for (const j of cells.get(`${x}|${z}`) ?? []) {
        const q = points[j]!, dx = p.x - q.x || 0.001, dz = p.z - q.z;
        const distance = Math.hypot(dx, dz), minimum = radii[i]! + radii[j]! + gap;
        if (distance >= minimum) continue;
        const push = (minimum - distance) * 0.51;
        p.x += dx / distance * push; p.z += dz / distance * push;
        q.x -= dx / distance * push; q.z -= dz / distance * push;
      }
      const key = `${Math.floor(p.x / cellSize)}|${Math.floor(p.z / cellSize)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(i);
      if (boundary) {
        const dx = p.x - boundary.x, dz = p.z - boundary.z, distance = Math.hypot(dx, dz), limit = boundary.radius - 20;
        if (distance > limit) { p.x = boundary.x + dx / distance * limit; p.z = boundary.z + dz / distance * limit; }
      }
    });
  }
}

export function packetKind(type: number): PacketKind {
  return type === 4 ? "advert" : type === 2 || type === 5 ? "text" : type === 9 ? "trace" : type === 3 ? "ack" : "other";
}

// Only adjacent, single-candidate, high-confidence hops become an animated segment.
// Keep gaps in place: filtering unknown hops first would fabricate a radio link.
export function reportFromEvent(event: WsPacketObservation["data"], graph: Topology, at: number): LiveReport | null {
  const obs = event?.observation;
  if (!obs || !event.packet || event.packet.isRepeat || typeof event.packetHash !== "string" || !event.packetHash || typeof obs.observerId !== "string" || !obs.observerId || typeof obs.iata !== "string") return null;
  const path = obs.resolvedPath;
  const hops: (ResolvedHop | null | undefined)[] = Array.isArray(path) ? [obs.resolvedSource, ...path.slice(0, 64), obs.resolvedDestination] : [];
  const ids = hops.map(h => h?.confidence === "high" && h.nodes?.length === 1 && graph.byId.has(h.nodes[0]!.id) ? h.nodes[0]!.id : null);
  const segments: [string, string][] = [];
  for (let i = 1; i < ids.length; i++) {
    const a = ids[i - 1], b = ids[i];
    if (a && b && a !== b) segments.push([a, b]);
  }
  return { key: `${event.packetHash}|${obs.observerId}`, hash: event.packetHash, observerId: obs.observerId, observerName: typeof obs.observerName === "string" ? obs.observerName : obs.observerId.slice(0, 8), iata: obs.iata, at, heardAt: obs.heardAt, kind: packetKind(event.packet.payloadType), scope: typeof event.packet.scope === "string" ? event.packet.scope : "", snr: Number.isFinite(obs.snr) ? obs.snr : null, segments, partial: !Array.isArray(path) || path.length > 64 || hops.some(h => h != null && (h.confidence !== "high" || h.nodes?.length !== 1 || !graph.byId.has(h.nodes[0]!.id))) };
}

export class LiveTraffic {
  reports: LiveReport[] = [];
  flows: LiveReport[] = [];
  trails = new Map<string, { from: string; to: string; kind: PacketKind; at: number }>();
  trailVersion = 0;
  cappedUntil = 0;
  gapUntil = 0;
  markGap() { this.gapUntil = Date.now() + LIVE_WINDOW; }
  private seen = new Map<string, number>();
  add(report: LiveReport) {
    this.prune(report.at);
    if (this.seen.has(report.key)) return false;
    this.seen.set(report.key, report.at);
    if (this.seen.size > REPORT_CAP * 2) this.seen.delete(this.seen.keys().next().value!);
    this.reports.push(report);
    for (const [from, to] of report.segments) {
      const key = `${from}|${to}`, old = this.trails.get(key);
      if (!old || old.kind !== report.kind) this.trailVersion++;
      this.trails.delete(key); this.trails.set(key, { from, to, kind: report.kind, at: report.at });
      if (this.trails.size > LINK_CAP) { this.trails.delete(this.trails.keys().next().value!); this.cappedUntil = report.at + LIVE_WINDOW; this.trailVersion++; }
    }
    if (this.reports.length > REPORT_CAP) { this.reports.shift(); this.cappedUntil = report.at + LIVE_WINDOW; }
    if (report.segments.length) {
      if (this.flows.length >= FLOW_CAP) this.cappedUntil = report.at + LIVE_WINDOW;
      this.flows = [...this.flows.slice(-(FLOW_CAP - 1)), report];
    }
    return true;
  }
  clearFlows() { this.flows = []; }
  prune(now: number) {
    this.reports = this.reports.filter(r => now - r.at < LIVE_WINDOW);
    this.flows = this.flows.filter(r => now - r.at < FLOW_MS);
    for (const [key, at] of this.seen) { if (now - at < LIVE_WINDOW) break; this.seen.delete(key); }
    for (const [key, trail] of this.trails) { if (now - trail.at < LIVE_WINDOW) break; this.trails.delete(key); this.trailVersion++; }
  }
}

export type Camera = { yaw: number; pitch: number; zoom: number; target: Point3 };
export const DEFAULT_CAMERA: Camera = { yaw: 0, pitch: 1.05, zoom: 1, target: { x: 0, y: 0, z: 0 } };
export function project(point: Point3, camera: Camera, width: number, height: number, extent: number) {
  const local = { x: point.x - camera.target.x, y: point.y - camera.target.y, z: point.z - camera.target.z };
  const x = local.x * Math.cos(camera.yaw) - local.z * Math.sin(camera.yaw);
  const z = local.x * Math.sin(camera.yaw) + local.z * Math.cos(camera.yaw);
  // Positive pitch puts the camera above the ground: raised nodes are closer.
  const y = local.y * Math.cos(camera.pitch) + z * Math.sin(camera.pitch);
  const depth = -local.y * Math.sin(camera.pitch) + z * Math.cos(camera.pitch);
  const perspective = 3 * extent / (3 * extent + depth);
  const scale = Math.min(width, height) / (extent * 2.6) * camera.zoom * perspective;
  return { x: width / 2 + x * scale, y: height / 2 - y * scale, depth, scale, visible: perspective > 0 };
}

export function fitCamera(points: Point3[], camera: Camera, width: number, height: number, extent: number): Camera {
  if (!points.length) return { ...DEFAULT_CAMERA, target: { ...DEFAULT_CAMERA.target } };
  const target = { x: 0, y: 0, z: 0 };
  for (const axis of ["x", "y", "z"] as const) target[axis] = (Math.min(...points.map(p => p[axis])) + Math.max(...points.map(p => p[axis]))) / 2;
  let base = { ...camera, target, zoom: 1 };
  // Perspective can shift the projected centre away from the world-space centre.
  // Recentre before scaling so Fit does not leave the mesh against one edge.
  for (let pass = 0; pass < 2; pass++) {
    const view = points.map(point => project(point, base, width, height, extent));
    const cx = (Math.min(...view.map(p => p.x)) + Math.max(...view.map(p => p.x))) / 2;
    const cy = (Math.min(...view.map(p => p.y)) + Math.max(...view.map(p => p.y))) / 2;
    base = panCamera(base, width / 2 - cx, height / 2 - cy, width, height, extent);
  }
  const projected = points.map(point => project(point, base, width, height, extent));
  const dx = Math.max(1, ...projected.map(p => Math.abs(p.x - width / 2)));
  const dy = Math.max(1, ...projected.map(p => Math.abs(p.y - height / 2)));
  return { ...base, zoom: Math.max(0.2, Math.min(80, Math.max(60, width - 100) / (2 * dx), Math.max(60, height - 100) / (2 * dy))) };
}

export function panCamera(camera: Camera, dx: number, dy: number, width: number, height: number, extent: number): Camera {
  const scale = Math.min(width, height) / (extent * 2.6) * camera.zoom;
  const x = -dx / scale, z = dy / (scale * Math.sin(camera.pitch));
  return { ...camera, target: { x: camera.target.x + x * Math.cos(camera.yaw) + z * Math.sin(camera.yaw), y: camera.target.y, z: camera.target.z - x * Math.sin(camera.yaw) + z * Math.cos(camera.yaw) } };
}

export function pathControls(a: Point3, b: Point3, crossRegion: boolean): [Point3, Point3, Point3, Point3] {
  const lift = Math.max(a.y, b.y) + (crossRegion ? 100 + Math.hypot(a.x - b.x, a.z - b.z) * 0.24 : 18);
  return [a, { ...a, y: lift }, { ...b, y: lift }, b];
}

export function visibleLinks(graph: Topology, display: PathDisplay, region: string, selected: string) {
  return graph.links.filter(([a, b]) => display === "all" || a === selected || b === selected ||
    (display === "bundled" && !!region && graph.byId.get(a)!.region === region && graph.byId.get(b)!.region === region));
}

export function flowColor(kind: PacketKind, c: ChartColors) {
  return { advert: c.green, text: c.secondary, trace: c.warn, ack: c.primary, other: c.textNormal }[kind];
}

export function linkContext(a: TopologyNode, b: TopologyNode) {
  return { crossRegion: a.region !== b.region, sharedDefault: a.defaultScope && a.defaultScope === b.defaultScope ? a.defaultScope : null };
}
