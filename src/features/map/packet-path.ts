import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { PacketDetail, Observation, ResolvedHop } from "../../types/api";
import { PayloadType } from "../../types/enums";
import { packetChain, locatedHopNode } from "./packet-flow";

export interface PathPoint {
  id: string;
  name?: string;
  lng: number;
  lat: number;
  breakBefore?: boolean;
}

export interface PacketPath {
  key: string; // observerId, or "trace"
  label: string; // observer name, a truncated observer id, or "Trace route"
  propagationMs?: number; // packet's propagation to this observer (ms); absent for the trace route
  color: string;
  points: PathPoint[];
}

// Distinct, saturated hues that read on both the dark and light basemaps. Local constants (like
// PACKET_FLOW_COLOR), not theme tokens — the selector swatch reuses each path's color.
export const PATH_COLORS: string[] = [
  "#ff6b35", // orange
  "#00b4d8", // cyan
  "#22c55e", // green
  "#e879f9", // pink
  "#eab308", // yellow
  "#3b82f6", // blue
  "#ef4444", // red
  "#a78bfa", // violet
];

// Keep known locations, but break lines at ambiguous/unlocated hops instead of inventing a link.
function pathPoints(hops: ResolvedHop[]): PathPoint[] {
  const seen = new Set<string>();
  const out: PathPoint[] = [];
  let gap = false;
  for (const hop of hops) {
    const node = locatedHopNode(hop);
    if (!node) { gap = true; continue; }
    if (!seen.has(node.id)) {
      seen.add(node.id);
      out.push({ id: node.id, name: node.name, lng: node.longitude!, lat: node.latitude!, ...(gap && out.length ? { breakBefore: true } : {}) });
      gap = false;
    } else if (out.at(-1)?.id !== node.id) gap = true;
  }
  return out;
}

function observerLabel(obs: Observation): string {
  return obs.observerName ?? obs.observerId.slice(0, 8);
}

// One drawable path per observation (and the trace route for TRACE packets) that resolves to >=2
// located hops, keyed by observerId and sorted fastest-first. Colors are assigned after sorting so
// the selector swatch matches the drawn line.
export function buildPacketPaths(detail: PacketDetail): PacketPath[] {
  const raw: Omit<PacketPath, "color">[] = [];
  const add = (key: string, label: string, propagationMs: number | undefined, points: PathPoint[]) => {
    if (points.length < 2) return;
    raw.push({ key, label, propagationMs, points });
  };

  const isTrace = detail.header.payloadType === PayloadType.TRACE;
  // TRACE observations now resolve to the same hops as detail.resolvedRoute, so their per-observation
  // lines would just duplicate the single "Trace route" below — draw only that one for traces.
  if (!isTrace) {
    for (const obs of detail.observations) {
      // Full chain: source → relay hops → destination, with gaps retained by pathPoints.
      const chain = packetChain(obs.resolvedSource, obs.resolvedPath, obs.resolvedDestination);
      add(obs.observerId, observerLabel(obs), obs.propagationTimeMs, pathPoints(chain));
    }
  }
  if (isTrace && detail.resolvedRoute) {
    add("trace", "Trace route", undefined, pathPoints(detail.resolvedRoute));
  }

  // fastest first; missing propagation (incl. the trace route) sorts last
  raw.sort((a, b) => ((a.propagationMs ?? Infinity) - (b.propagationMs ?? Infinity)) || 0); // || 0: two Infinity props → NaN; keep insertion order
  return raw.map((p, i) => ({ ...p, color: PATH_COLORS[i % PATH_COLORS.length]! }));
}

export interface PathLineProps {
  key: string;
  color: string;
}

export interface PathNodeProps {
  key: string;
  color: string;
  label: string; // short label for the map (truncated id when unnamed)
  title: string; // untruncated name/id for the click popup
  endpoint: "start" | "end" | "mid";
}

// Selection: null = every path ("All paths"); a key isolates that one path. Returns the line + node
// FeatureCollections to setData() and the coords to fitBounds over.
export function packetPathsToFeatures(
  paths: PacketPath[],
  selectedKey: string | null,
): { lines: FeatureCollection<LineString, PathLineProps>; points: FeatureCollection<Point, PathNodeProps>; bounds: [number, number][] } {
  const shown = selectedKey ? paths.filter((p) => p.key === selectedKey) : paths;
  const lines: Feature<LineString, PathLineProps>[] = [];
  const points: Feature<Point, PathNodeProps>[] = [];
  const bounds: [number, number][] = [];

  for (const path of shown) {
    let segment: [number, number][] = [];
    const finishSegment = () => {
      if (segment.length > 1) lines.push({ type: "Feature", properties: { key: path.key, color: path.color }, geometry: { type: "LineString", coordinates: segment } });
      segment = [];
    };
    for (const point of path.points) {
      if (point.breakBefore) finishSegment();
      segment.push([point.lng, point.lat]);
    }
    finishSegment();
    path.points.forEach((pt, i) => {
      const endpoint = i === 0 ? "start" : i === path.points.length - 1 ? "end" : "mid";
      points.push({
        type: "Feature",
        properties: { key: path.key, color: path.color, label: pt.name ?? pt.id.slice(0, 6), title: pt.name ?? pt.id, endpoint },
        geometry: { type: "Point", coordinates: [pt.lng, pt.lat] },
      });
      bounds.push([pt.lng, pt.lat]);
    });
  }

  return {
    lines: { type: "FeatureCollection", features: lines },
    points: { type: "FeatureCollection", features: points },
    bounds,
  };
}
