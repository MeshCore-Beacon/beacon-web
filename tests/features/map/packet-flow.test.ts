import { describe, it, expect } from "vitest";
import { packetChain, resolvedPathNodes, posAtHop, trailCoords } from "../../../src/features/map/packet-flow";
import type { ResolvedHop } from "../../../src/types/api";

function hop(id: string, lng: number, lat: number): ResolvedHop {
  return { confidence: "high", nodes: [{ id, publicKey: "pk", longitude: lng, latitude: lat }] };
}

describe("packetChain", () => {
  const relay = hop("r", -75, 45);

  it("wraps the relay hops in a high-confidence source and destination", () => {
    const src = hop("s", -70, 40);
    const dst = hop("d", -80, 50);
    expect(packetChain(src, [relay], dst)).toEqual([src, relay, dst]);
  });

  it("drops ambiguous and unresolved endpoints", () => {
    const ambiguous: ResolvedHop = { confidence: "ambiguous", nodes: [{ id: "x", publicKey: "pk", longitude: -70, latitude: 40 }] };
    expect(packetChain(ambiguous, [relay], { confidence: "none", nodes: [] })).toEqual([relay]);
  });

  it("accepts null or absent endpoints and leaves relay hops untouched", () => {
    const ambiguousRelay: ResolvedHop = { confidence: "ambiguous", nodes: [{ id: "y", publicKey: "pk", longitude: -76, latitude: 46 }] };
    expect(packetChain(null, [relay, ambiguousRelay], undefined)).toEqual([relay, ambiguousRelay]);
  });
});

describe("resolvedPathNodes", () => {
  it("returns each hop's first located node as {id,lng,lat}, deduped, in order", () => {
    const path: ResolvedHop[] = [hop("a", -75, 45), { confidence: "none", nodes: [] }, hop("a", -75, 45), hop("b", -76, 46)];
    expect(resolvedPathNodes(path)).toEqual([{ id: "a", lng: -75, lat: 45 }, { id: "b", lng: -76, lat: 46 }]);
  });

  it("skips hops with no located candidate", () => {
    expect(resolvedPathNodes([{ confidence: "ambiguous", nodes: [{ id: "x", publicKey: "pk" }] }])).toEqual([]);
  });

  it("skips reset/invalid candidates and still finds a usable candidate", () => {
    const candidates: ResolvedHop = { confidence: "ambiguous", nodes: [...hop("reset", 0, 0).nodes, ...hop("invalid", 10, 91).nodes, ...hop("valid", 0, 45).nodes] };
    expect(resolvedPathNodes([hop("unknown", 0, 0), candidates, hop("bad", Infinity, 10)])).toEqual([{ id: "valid", lng: 0, lat: 45 }]);
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
