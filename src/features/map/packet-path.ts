import type { Feature, FeatureCollection, LineString, Point } from "geojson";
import type { PacketDetail, Observation, ResolvedHop } from "../../types/api";
import { PayloadType } from "../../types/enums";

export interface PathPoint {
  id: string;
  name?: string;
  lng: number;
  lat: number;
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

// The located nodes on a resolved path — first candidate per hop that has coords, deduped by id, in
// order. Modelled on resolvedPathNodes() in packet-flow.ts, but keeps each node's name for labels.
function pathPoints(hops: ResolvedHop[]): PathPoint[] {
  const seen = new Set<string>();
  const out: PathPoint[] = [];
  for (const hop of hops) {
    const node = hop.nodes.find((n) => n.latitude != null && n.longitude != null);
    if (node && !seen.has(node.id)) {
      seen.add(node.id);
      out.push({ id: node.id, name: node.name, lng: node.longitude!, lat: node.latitude! });
    }
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
      // full chain: source → relay hops → destination; missing/unlocated endpoints drop out in pathPoints
      const chain = [obs.resolvedSource, ...obs.resolvedPath, obs.resolvedDestination].filter(
        (h): h is ResolvedHop => h != null,
      );
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
    lines.push({
      type: "Feature",
      properties: { key: path.key, color: path.color },
      geometry: { type: "LineString", coordinates: path.points.map((p) => [p.lng, p.lat]) },
    });
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
