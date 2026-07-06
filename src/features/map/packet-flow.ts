import type { Feature, FeatureCollection, Point } from "geojson";
import type { ResolvedHop } from "../../types/api";

// Geometry helpers for the packet-flow animation. No maplibre import, so they stay unit-testable.

// The [lng, lat] path a packet took, one point per resolved hop. Each hop uses its first located
// candidate; hops we can't place are dropped, so the route can come back with fewer than 2 points.
export function resolvedPathToRoute(resolvedPath: ResolvedHop[]): [number, number][] {
  const route: [number, number][] = [];
  for (const hop of resolvedPath) {
    const node = hop.nodes.find((n) => n.latitude != null && n.longitude != null);
    if (node) route.push([node.longitude!, node.latitude!]);
  }
  return route;
}

// Cumulative segment lengths (planar distance in degrees — accurate enough at mesh scale) so a pulse
// can be placed by fraction of total path length rather than fraction of hop count.
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
export function positionAt(
  coords: [number, number][],
  cumLengths: number[],
  total: number,
  t: number,
): [number, number] {
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

// One in-flight packet animation. cumLengths/total are precomputed (routeMetrics) so each frame is
// just an interpolation.
export interface Pulse {
  id: number;
  coords: [number, number][];
  cumLengths: number[];
  total: number;
  startMs: number;
  durationMs: number;
}

export interface PulseFeatureProps {
  opacity: number;
}

// Elapsed fraction of a pulse's life; >1 once it has arrived (the caller expires those).
export function pulseProgress(pulse: Pulse, nowMs: number): number {
  return pulse.durationMs <= 0 ? 1 : (nowMs - pulse.startMs) / pulse.durationMs;
}

// Snapshot the live pulses as point features at their current positions. Opacity holds at 1 then
// eases out over the final quarter so a pulse fades as it reaches the last repeater.
export function buildPulseFC(pulses: Pulse[], nowMs: number): FeatureCollection<Point, PulseFeatureProps> {
  const features: Feature<Point, PulseFeatureProps>[] = [];
  for (const p of pulses) {
    const t = pulseProgress(p, nowMs);
    const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
    const opacity = clamped < 0.75 ? 1 : Math.max(0, 1 - (clamped - 0.75) / 0.25);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: positionAt(p.coords, p.cumLengths, p.total, clamped) },
      properties: { opacity },
    });
  }
  return { type: "FeatureCollection", features };
}
