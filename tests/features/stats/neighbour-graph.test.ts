import { describe, it, expect } from "vitest";
import { buildNeighbourGraph, buildEgoGraph, obsColor, ageOpacity, labelSize, nodeNameMatches } from "../../../src/features/stats/neighbour-graph";
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

  it("gives busier hubs a larger label font than quieter ones", () => {
    const g = buildNeighbourGraph(
      [node({ id: "hub", knownNeighborCount: 40 }), node({ id: "small", knownNeighborCount: 2 })],
      10,
    );
    const hub = g.nodes.find((n) => n.id === "hub")!;
    const small = g.nodes.find((n) => n.id === "small")!;
    expect(hub.label?.show).toBe(true);
    expect(small.label?.show).toBe(true);
    expect(hub.label!.fontSize!).toBeGreaterThan(small.label!.fontSize!);
  });
});

describe("nodeNameMatches", () => {
  it("matches a case-insensitive substring", () => {
    expect(nodeNameMatches("McCall_Lake", "call")).toBe(true);
    expect(nodeNameMatches("YWK Repeater", "repe")).toBe(true);
  });
  it("does not match a missing substring", () => {
    expect(nodeNameMatches("McCall_Lake", "xyz")).toBe(false);
  });
  it("treats an empty/whitespace query as no match", () => {
    expect(nodeNameMatches("anything", "")).toBe(false);
    expect(nodeNameMatches("anything", "   ")).toBe(false);
  });
});

describe("labelSize", () => {
  it("grows with degree and is largest at the max", () => {
    expect(labelSize(40, 40)).toBeGreaterThan(labelSize(5, 40));
    expect(labelSize(20, 40)).toBeGreaterThanOrEqual(labelSize(5, 40));
  });

  it("clamps to a sane font range and survives maxDegree 0", () => {
    expect(labelSize(0, 0)).toBeGreaterThanOrEqual(9);
    expect(labelSize(0, 40)).toBeGreaterThanOrEqual(9);
    expect(labelSize(1000, 1000)).toBeLessThanOrEqual(16);
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

describe("buildEgoGraph", () => {
  const NOW = 10 * DAY;
  const center = { id: "c", name: "Center", nodeTypeName: "companion" };

  it("puts the center first with its neighbours fanned out from it", () => {
    const g = buildEgoGraph(center, [neighbor({ id: "a" }), neighbor({ id: "b" })], NOW);
    expect(g.nodes.map((n) => n.id)).toEqual(["c", "a", "b"]);
    expect(g.links).toHaveLength(2);
    expect(g.links.every((l) => l.source === 0)).toBe(true);
    expect(g.nodes[0]!.category).toBe(0); // companion
  });

  it("shows a label on every node", () => {
    const g = buildEgoGraph(center, [neighbor({ id: "a" })], NOW);
    expect(g.nodes.every((n) => n.label?.show)).toBe(true);
  });

  it("folds per-iata rows: obs summed, freshest lastSeen wins", () => {
    const g = buildEgoGraph(
      center,
      [
        neighbor({ id: "a", iata: "YYZ", observationCount: 3, lastSeen: 8 * DAY }),
        neighbor({ id: "a", iata: "YUL", observationCount: 5, lastSeen: 9 * DAY }),
      ],
      NOW,
    );
    expect(g.nodes.filter((n) => n.id === "a")).toHaveLength(1);
    const link = g.links.find((l) => g.nodes[l.target]!.id === "a")!;
    expect(link.obs).toBe(8);
    expect(link.ageDays).toBeCloseTo(1);
  });

  it("excludes the center's own rows", () => {
    const g = buildEgoGraph(center, [neighbor({ id: "c" })], NOW);
    expect(g.nodes).toHaveLength(1);
    expect(g.links).toEqual([]);
  });

  it("returns just the center when there are no neighbours", () => {
    const g = buildEgoGraph(center, [], NOW);
    expect(g.nodes.map((n) => n.id)).toEqual(["c"]);
    expect(g.links).toEqual([]);
  });

  it("never reports a negative edge age", () => {
    const g = buildEgoGraph(center, [neighbor({ id: "a", lastSeen: NOW + 3 * DAY })], NOW);
    expect(g.links[0]!.ageDays).toBe(0);
  });

  it("maps a neighbour's node type to a category index", () => {
    const g = buildEgoGraph(center, [neighbor({ id: "a", nodeTypeName: "sensor" })], NOW);
    expect(g.nodes.find((n) => n.id === "a")!.category).toBe(3);
  });
});
