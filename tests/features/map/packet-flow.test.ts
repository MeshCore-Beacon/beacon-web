import { describe, it, expect } from "vitest";
import { resolvedPathNodes, posAtHop, trailCoords } from "../../../src/features/map/packet-flow";
import type { ResolvedHop } from "../../../src/types/api";

function hop(id: string, lng: number, lat: number): ResolvedHop {
  return { confidence: "high", nodes: [{ id, publicKey: "pk", longitude: lng, latitude: lat }] };
}

describe("resolvedPathNodes", () => {
  it("returns each hop's first located node as {id,lng,lat}, deduped, in order", () => {
    const path: ResolvedHop[] = [hop("a", -75, 45), { confidence: "none", nodes: [] }, hop("a", -75, 45), hop("b", -76, 46)];
    expect(resolvedPathNodes(path)).toEqual([{ id: "a", lng: -75, lat: 45 }, { id: "b", lng: -76, lat: 46 }]);
  });

  it("skips hops with no located candidate", () => {
    expect(resolvedPathNodes([{ confidence: "ambiguous", nodes: [{ id: "x", publicKey: "pk" }] }])).toEqual([]);
  });
});

describe("posAtHop", () => {
  const coords: [number, number][] = [[0, 0], [10, 0], [10, 10]];

  it("returns hop endpoints at integer t and interpolates within a segment", () => {
    expect(posAtHop(coords, 0)).toEqual([0, 0]);
    expect(posAtHop(coords, 1)).toEqual([10, 0]);
    expect(posAtHop(coords, 2)).toEqual([10, 10]);
    expect(posAtHop(coords, 0.5)).toEqual([5, 0]); // halfway through hop 0
    expect(posAtHop(coords, 1.5)).toEqual([10, 5]); // halfway through hop 1
  });

  it("clamps beyond either end", () => {
    expect(posAtHop(coords, -1)).toEqual([0, 0]);
    expect(posAtHop(coords, 9)).toEqual([10, 10]);
  });
});

describe("trailCoords", () => {
  const coords: [number, number][] = [[0, 0], [10, 0], [10, 10]];

  it("traces every crossed hop plus the current head position", () => {
    expect(trailCoords(coords, 1.5)).toEqual([[0, 0], [10, 0], [10, 5]]);
  });
});
