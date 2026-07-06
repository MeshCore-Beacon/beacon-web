import { describe, it, expect } from "vitest";
import { resolvedPathToRoute, routeMetrics, positionAt, buildPulseFC } from "../../../src/features/map/packet-flow";
import type { ResolvedHop } from "../../../src/types/api";

// a high-confidence hop resolved to one located node at [lng, lat]
function hop(lng: number, lat: number): ResolvedHop {
  return { confidence: "high", nodes: [{ id: "n", publicKey: "pk", longitude: lng, latitude: lat }] };
}

describe("resolvedPathToRoute", () => {
  it("keeps located hops in order as [lng, lat] and drops coordless hops", () => {
    const path: ResolvedHop[] = [hop(-75, 45), { confidence: "none", nodes: [] }, hop(-76, 46)];
    expect(resolvedPathToRoute(path)).toEqual([[-75, 45], [-76, 46]]);
  });

  it("returns fewer than 2 points when the path has no drawable geometry", () => {
    expect(resolvedPathToRoute([{ confidence: "none", nodes: [] }])).toEqual([]);
  });
});

describe("routeMetrics + positionAt", () => {
  it("interpolates endpoints and the midpoint of a straight segment", () => {
    const coords: [number, number][] = [[0, 0], [10, 0]];
    const { cumLengths, total } = routeMetrics(coords);
    expect(total).toBe(10);
    expect(positionAt(coords, cumLengths, total, 0)).toEqual([0, 0]);
    expect(positionAt(coords, cumLengths, total, 1)).toEqual([10, 0]);
    expect(positionAt(coords, cumLengths, total, 0.5)).toEqual([5, 0]);
  });

  it("walks the correct segment on a multi-hop route", () => {
    const coords: [number, number][] = [[0, 0], [10, 0], [10, 10]];
    const { cumLengths, total } = routeMetrics(coords);
    expect(total).toBe(20);
    expect(positionAt(coords, cumLengths, total, 0.5)).toEqual([10, 0]); // the middle vertex
    expect(positionAt(coords, cumLengths, total, 0.75)).toEqual([10, 5]);
  });
});

describe("buildPulseFC", () => {
  const coords: [number, number][] = [[0, 0], [10, 0]];
  const { cumLengths, total } = routeMetrics(coords);
  const pulse = { id: 1, coords, cumLengths, total, startMs: 1000, durationMs: 1000 };

  it("places each pulse at its current position along the route", () => {
    const fc = buildPulseFC([pulse], 1500); // halfway through
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry.coordinates).toEqual([5, 0]);
  });

  it("keeps full opacity early and fades to zero at the end", () => {
    expect(buildPulseFC([pulse], 1500).features[0]!.properties.opacity).toBe(1); // t=0.5
    expect(buildPulseFC([pulse], 2000).features[0]!.properties.opacity).toBe(0); // t=1
  });
});
