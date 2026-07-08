import type { ResolvedHop } from "../../types/api";

// Pure helpers for the live packet-flow animation (modelled on MeshMapper's LiveViz). No maplibre
// import, so they stay unit-testable; the hook owns the layers, the rAF loop, and the node flashes.

// The located nodes on a packet's resolved path — first candidate per hop, deduped by id. The dot
// rides these coords and flashes each node as it crosses.
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

// Position at fractional hop index t (0 .. coords.length-1): the integer part picks the hop segment,
// the fraction interpolates within it. Constant time per hop, so long and short hops feel the same.
export function posAtHop(coords: [number, number][], t: number): [number, number] {
  const n = coords.length - 1;
  if (t <= 0) return coords[0]!;
  if (t >= n) return coords[n]!;
  const s = Math.floor(t);
  const f = t - s;
  const a = coords[s]!;
  const b = coords[s + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

// The polyline the dot has traced so far: every hop coord up to the head, plus the head position.
export function trailCoords(coords: [number, number][], headT: number): [number, number][] {
  const seg = Math.floor(headT);
  const out: [number, number][] = [];
  for (let s = 0; s <= seg && s < coords.length; s++) out.push(coords[s]!);
  out.push(posAtHop(coords, headT));
  return out;
}
