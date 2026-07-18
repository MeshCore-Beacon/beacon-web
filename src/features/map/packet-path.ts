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
  key: string; // observation id as string, or "trace"
  label: string; // observer name, or a truncated observer id, or "Trace route"
  hopCount: number;
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
// located hops. Colors are assigned by result index so they stay contiguous after filtering.
export function buildPacketPaths(detail: PacketDetail): PacketPath[] {
  const paths: PacketPath[] = [];
  const push = (key: string, label: string, hopCount: number, points: PathPoint[]) => {
    if (points.length < 2) return;
    paths.push({ key, label, hopCount, color: PATH_COLORS[paths.length % PATH_COLORS.length]!, points });
  };

  for (const obs of detail.observations) {
    push(String(obs.id), observerLabel(obs), obs.pathLength.hopCount, pathPoints(obs.resolvedPath));
  }
  if (detail.header.payloadType === PayloadType.TRACE && detail.resolvedRoute) {
    const pts = pathPoints(detail.resolvedRoute);
    push("trace", "Trace route", detail.resolvedRoute.length, pts);
  }
  return paths;
}

export interface PathLineProps {
  key: string;
  color: string;
}

export interface PathNodeProps {
  key: string;
  color: string;
  label: string;
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
        properties: { key: path.key, color: path.color, label: pt.name ?? pt.id.slice(0, 6), endpoint },
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
