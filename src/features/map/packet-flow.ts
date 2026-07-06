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

// --- Comet: a bright head that shoots along the route, trailing a fading streak ---

// Cumulative segment lengths (planar degrees — fine at mesh scale) so the head can be placed by
// fraction of total path length rather than fraction of hop count.
export function routeMetrics(coords: [number, number][]): { cumLengths: number[]; total: number } {
  const cumLengths: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1]!;
    const [x1, y1] = coords[i]!;
    cumLengths.push(cumLengths[i - 1]! + Math.hypot(x1 - x0, y1 - y0));
  }
  return { cumLengths, total: cumLengths[cumLengths.length - 1] ?? 0 };
}

// Interpolated [lng, lat] at fraction t in [0,1] along the route, by cumulative length.
export function positionAt(coords: [number, number][], cumLengths: number[], total: number, t: number): [number, number] {
  if (coords.length === 1 || total === 0) return coords[0]!;
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const target = clamped * total;
  let i = 1;
  while (i < cumLengths.length - 1 && cumLengths[i]! < target) i++;
  const segStart = cumLengths[i - 1]!;
  const segEnd = cumLengths[i]!;
  const segFrac = segEnd === segStart ? 0 : (target - segStart) / (segEnd - segStart);
  const [x0, y0] = coords[i - 1]!;
  const [x1, y1] = coords[i]!;
  return [x0 + (x1 - x0) * segFrac, y0 + (y1 - y0) * segFrac];
}

// One in-flight comet. cumLengths/total are precomputed (routeMetrics) so each frame is an interpolation.
export interface Pulse {
  id: number;
  coords: [number, number][];
  cumLengths: number[];
  total: number;
  startMs: number;
  durationMs: number;
}

export interface CometFeatureProps {
  opacity: number;
  head: number; // 1 for the bright head, 0 for trail points
}

// Elapsed fraction of a comet's travel; >1 once it has arrived (the caller expires those).
export function pulseProgress(pulse: Pulse, nowMs: number): number {
  return pulse.durationMs <= 0 ? 1 : (nowMs - pulse.startMs) / pulse.durationMs;
}

const COMET_TRAIL = 5; // trailing points behind the head
const COMET_STEP = 0.045; // spacing between trail points, as a fraction of travel

// The comet head + a short trail behind it, each a point with its own opacity. The whole comet eases
// out over the final stretch so it fades as it reaches the last repeater.
export function buildCometFC(pulses: Pulse[], nowMs: number): FeatureCollection<Point, CometFeatureProps> {
  const features: Feature<Point, CometFeatureProps>[] = [];
  for (const p of pulses) {
    const t = pulseProgress(p, nowMs);
    const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
    const life = clamped < 0.85 ? 1 : Math.max(0, 1 - (clamped - 0.85) / 0.15);
    for (let k = 0; k <= COMET_TRAIL; k++) {
      const tk = clamped - k * COMET_STEP;
      if (tk < 0) break;
      const trail = 1 - k / (COMET_TRAIL + 1); // head brightest, tail dimmest
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: positionAt(p.coords, p.cumLengths, p.total, tk) },
        properties: { opacity: life * trail, head: k === 0 ? 1 : 0 },
      });
    }
  }
  return { type: "FeatureCollection", features };
}
