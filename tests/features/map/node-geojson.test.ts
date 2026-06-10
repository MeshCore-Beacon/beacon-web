import { describe, it, expect } from "vitest";
import { nodesToFeatureCollection, filterByNodeType } from "../../../src/features/map/node-geojson";
import type { NodeSummary } from "../../../src/features/nodes/types";

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
    ...overrides,
  };
}

describe("nodesToFeatureCollection", () => {
  it("returns an empty FeatureCollection for no nodes", () => {
    const fc = nodesToFeatureCollection([]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toEqual([]);
  });

  it("maps a located node to a Point feature in [lng, lat] order", () => {
    const fc = nodesToFeatureCollection([node({ lat: 45.3, lng: -75.6 })]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry).toEqual({ type: "Point", coordinates: [-75.6, 45.3] });
  });

  it("keeps whole-degree coordinates intact (the API sends decimal degrees, never microdegrees)", () => {
    const fc = nodesToFeatureCollection([node({ lat: 51, lng: -114 })]);
    expect(fc.features[0]!.geometry.coordinates).toEqual([-114, 51]);
  });

  it("carries id/name/nodeTypeName/isObserver as feature properties", () => {
    const fc = nodesToFeatureCollection([
      node({ id: "abc", name: "Relay A", nodeType: 2, nodeTypeName: "sensor" }),
    ]);
    expect(fc.features[0]!.properties).toEqual({
      id: "abc",
      name: "Relay A",
      nodeTypeName: "sensor",
      isObserver: false,
    });
  });

  it("defaults isObserver to false and reflects it when set", () => {
    const fc = nodesToFeatureCollection([
      node({ id: "plain" }),
      node({ id: "obs", isObserver: true }),
    ]);
    expect(fc.features[0]!.properties.isObserver).toBe(false);
    expect(fc.features[1]!.properties.isObserver).toBe(true);
  });

  it("drops nodes missing lat or lng", () => {
    const fc = nodesToFeatureCollection([
      node({ id: "a", lat: null, lng: -75 }),
      node({ id: "b", lat: 45, lng: null }),
      node({ id: "c", lat: 45, lng: -75 }),
    ]);
    expect(fc.features.map((f) => f.properties.id)).toEqual(["c"]);
  });

  it("keeps nodes at the 0/0 coordinate (0 is a valid coordinate)", () => {
    const fc = nodesToFeatureCollection([node({ id: "z", lat: 0, lng: 0 })]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry.coordinates).toEqual([0, 0]);
  });

  it("passes decimal coordinates through untouched (api/nodes.go sends *float64 degrees)", () => {
    const fc = nodesToFeatureCollection([node({ lat: 49.28, lng: -123.12 })]);
    expect(fc.features[0]!.geometry.coordinates).toEqual([-123.12, 49.28]);
  });
});

describe("filterByNodeType", () => {
  const fc = nodesToFeatureCollection([
    node({ id: "r1", nodeTypeName: "repeater" }),
    node({ id: "c1", nodeTypeName: "companion" }),
    node({ id: "r2", nodeTypeName: "repeater" }),
  ]);

  it("returns all features (same reference) for an empty type = All", () => {
    expect(filterByNodeType(fc, "")).toBe(fc);
  });

  it("keeps only features matching the given type", () => {
    expect(filterByNodeType(fc, "repeater").features.map((f) => f.properties.id)).toEqual(["r1", "r2"]);
  });

  it("returns an empty collection when nothing matches", () => {
    const out = filterByNodeType(fc, "sensor");
    expect(out.type).toBe("FeatureCollection");
    expect(out.features).toEqual([]);
  });
});
