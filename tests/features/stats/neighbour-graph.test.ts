import { describe, it, expect } from "vitest";
import { buildNeighbourGraph, obsColor, ageOpacity, foldNeighbourWeights } from "../../../src/features/stats/neighbour-graph";
import type { NodeSummary, NodeNeighbor } from "../../../src/features/nodes/types";

function neighbor(overrides: Partial<NodeNeighbor>): NodeNeighbor {
  return {
    id: "nb",
    publicKey: "pk",
    nodeType: 1,
    nodeTypeName: "repeater",
    iata: "YYZ",
    observationCount: 1,
    firstSeen: 0,
    lastSeen: 0,
    ...overrides,
  };
}

const DAY = 86_400_000;

function node(overrides: Partial<NodeSummary>): NodeSummary {
  return {
    id: "n1",
    publicKey: "pk",
    nodeType: 1,
    nodeTypeName: "repeater",
    name: "Node 1",
    lat: 45,
    lng: -75,
    iatas: [],
    knownNeighborCount: 0,
    ...overrides,
  };
}

// obsColor takes explicit palette colours so the test is theme-independent.
const C = { danger: "#ff0000", warn: "#ffff00", green: "#00ff00" };

describe("buildNeighbourGraph", () => {
  it("returns an empty graph for no nodes", () => {
    expect(buildNeighbourGraph([], 1000)).toEqual({ nodes: [], links: [], total: 0, capped: false });
  });

  it("includes unlocated nodes (unlike the map's coordinate-gated edges)", () => {
    const g = buildNeighbourGraph([node({ id: "a", lat: null, lng: null })], 1000);
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]!.id).toBe("a");
  });

  it("ranks by neighbour count and keeps only the top `cap`", () => {
    const g = buildNeighbourGraph(
      [
        node({ id: "low", knownNeighborCount: 1 }),
        node({ id: "high", knownNeighborCount: 5 }),
        node({ id: "mid", knownNeighborCount: 3 }),
      ],
      2,
    );
    expect(g.total).toBe(3);
    expect(g.capped).toBe(true);
    expect(g.nodes.map((n) => n.id)).toEqual(["high", "mid"]);
  });

  it("is not capped when total <= cap", () => {
    const g = buildNeighbourGraph([node({ id: "a" }), node({ id: "b" })], 5);
    expect(g.capped).toBe(false);
    expect(g.total).toBe(2);
  });

  it("breaks equal-degree ties by id so indices are deterministic", () => {
    const g = buildNeighbourGraph(
      [node({ id: "b", knownNeighborCount: 2 }), node({ id: "a", knownNeighborCount: 2 })],
      5,
    );
    expect(g.nodes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("emits each undirected pair once even when both nodes list each other", () => {
    const g = buildNeighbourGraph(
      [node({ id: "a", neighborIds: ["b"] }), node({ id: "b", neighborIds: ["a"] })],
      5,
    );
    expect(g.links).toHaveLength(1);
  });

  it("drops self-loops", () => {
    const g = buildNeighbourGraph([node({ id: "a", neighborIds: ["a"] })], 5);
    expect(g.links).toEqual([]);
  });

  it("drops edges to ids outside the kept set (foreign or capped-out)", () => {
    const g = buildNeighbourGraph(
      [
        node({ id: "keep", knownNeighborCount: 9, neighborIds: ["gone", "foreign"] }),
        node({ id: "gone", knownNeighborCount: 0 }),
      ],
      1, // only "keep" survives the cap
    );
    expect(g.links).toEqual([]);
  });

  it("resolves link source/target to indices of the correct kept nodes", () => {
    const g = buildNeighbourGraph(
      [node({ id: "a", neighborIds: ["b"] }), node({ id: "b" })],
      5,
    );
    expect(g.links).toHaveLength(1);
    const { source, target } = g.links[0]!;
    const ids = [g.nodes[source]!.id, g.nodes[target]!.id].sort();
    expect(ids).toEqual(["a", "b"]);
  });

  it("maps node type to a category index, bucketing unknowns to 'Other'", () => {
    const g = buildNeighbourGraph(
      [
        node({ id: "c", nodeTypeName: "companion" }),
        node({ id: "r", nodeTypeName: "repeater" }),
        node({ id: "rs", nodeTypeName: "room_server" }),
        node({ id: "s", nodeTypeName: "sensor" }),
        node({ id: "x", nodeTypeName: "mystery" }),
      ],
      10,
    );
    const cat = Object.fromEntries(g.nodes.map((n) => [n.id, n.category]));
    expect(cat).toEqual({ c: 0, r: 1, rs: 2, s: 3, x: 4 });
  });

  it("sizes nodes monotonically by degree, with a floor for degree 0", () => {
    const g = buildNeighbourGraph(
      [
        node({ id: "hub", knownNeighborCount: 40 }),
        node({ id: "mid", knownNeighborCount: 8 }),
        node({ id: "leaf", knownNeighborCount: 0 }),
      ],
      10,
    );
    const size = Object.fromEntries(g.nodes.map((n) => [n.id, n.symbolSize]));
    expect(size.hub).toBeGreaterThan(size.mid!);
    expect(size.mid).toBeGreaterThan(size.leaf!);
    expect(size.leaf).toBeGreaterThan(0);
  });

  it("keeps a node with no neighborIds but contributes no links", () => {
    const g = buildNeighbourGraph([node({ id: "a", neighborIds: undefined })], 5);
    expect(g.nodes).toHaveLength(1);
    expect(g.links).toEqual([]);
  });
});

describe("obsColor", () => {
  it("is red (danger) at one observation and below", () => {
    expect(obsColor(1, C)).toBe("rgb(255, 0, 0)");
    expect(obsColor(0, C)).toBe("rgb(255, 0, 0)");
  });

  it("saturates to green for high observation counts", () => {
    expect(obsColor(1000, C)).toBe("rgb(0, 255, 0)");
  });

  it("interpolates strictly between the endpoints for mid counts", () => {
    const mid = obsColor(5, C);
    expect(mid).not.toBe("rgb(255, 0, 0)");
    expect(mid).not.toBe("rgb(0, 255, 0)");
  });
});

describe("ageOpacity", () => {
  it("is nearly solid for fresh links", () => {
    expect(ageOpacity(0)).toBeCloseTo(0.9);
    expect(ageOpacity(-5)).toBeCloseTo(0.9); // clamped
  });

  it("fades to the floor by ~4 weeks and stays there", () => {
    expect(ageOpacity(28)).toBeCloseTo(0.35);
    expect(ageOpacity(56)).toBeCloseTo(0.35); // clamped
  });

  it("interpolates linearly in between", () => {
    expect(ageOpacity(14)).toBeCloseTo(0.625);
  });
});

describe("foldNeighbourWeights", () => {
  const NOW = 10 * DAY;

  it("returns an empty map for no neighbours", () => {
    expect(foldNeighbourWeights([], "self", NOW)).toEqual({});
  });

  it("sums observations and takes the freshest lastSeen across per-iata rows", () => {
    const w = foldNeighbourWeights(
      [
        neighbor({ id: "a", iata: "YYZ", observationCount: 3, lastSeen: 8 * DAY }),
        neighbor({ id: "a", iata: "YUL", observationCount: 5, lastSeen: 9 * DAY }),
      ],
      "self",
      NOW,
    );
    expect(w.a!.obs).toBe(8);
    expect(w.a!.ageDays).toBeCloseTo(1); // NOW - 9d (the freshest)
  });

  it("excludes the selected node's own rows", () => {
    const w = foldNeighbourWeights([neighbor({ id: "self", observationCount: 4 })], "self", NOW);
    expect(w).toEqual({});
  });

  it("never reports a negative age for a future lastSeen", () => {
    const w = foldNeighbourWeights([neighbor({ id: "a", lastSeen: NOW + 5 * DAY })], "self", NOW);
    expect(w.a!.ageDays).toBe(0);
  });
});
