import type { Feature, FeatureCollection, Point } from "geojson";
import type { ResolvedHop } from "../../types/api";

// Pure helpers for the live packet-flow highlight. No maplibre import, so they stay unit-testable.

// The located nodes on a packet's resolved path — first candidate per hop, deduped by id. These are
// the nodes that light up when the packet is observed.
export function resolvedPathNodes(resolvedPath: ResolvedHop[]): { id: string; lng: number; lat: number }[] {
  const seen = new Set<string>();
  const out: { id: string; lng: number; lat: number }[] = [];
  for (const hop of resolvedPath) {
    const node = hop.nodes.find((n) => n.latitude != null && n.longitude != null);
    if (node && !seen.has(node.id)) {
      seen.add(node.id);
      out.push({ id: node.id, lng: node.longitude!, lat: node.latitude! });
    }
  }
  return out;
}

// A node currently lit because it was on a recently-observed path. litAt is performance.now().
export interface LitNode {
  lng: number;
  lat: number;
  litAt: number;
}

export interface LitFeatureProps {
  opacity: number;
}

// Opacity of a lit node: 1 the instant it lights, linearly down to 0 by fadeMs, clamped past that.
export function litOpacity(litAt: number, nowMs: number, fadeMs: number): number {
  const t = (nowMs - litAt) / fadeMs;
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  return 1 - t;
}

// Snapshot the currently-lit nodes as point features carrying their faded opacity.
export function buildLitFC(litNodes: LitNode[], nowMs: number, fadeMs: number): FeatureCollection<Point, LitFeatureProps> {
  const features: Feature<Point, LitFeatureProps>[] = litNodes.map((n) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [n.lng, n.lat] },
    properties: { opacity: litOpacity(n.litAt, nowMs, fadeMs) },
  }));
  return { type: "FeatureCollection", features };
}
