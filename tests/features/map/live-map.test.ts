import { describe, it, expect } from "vitest";
import {
  stripPictographs,
  nodeGlow,
  idleDotTypes,
  lightNode,
  litFeatureCollection,
  buildLiveNodeIndex,
  withSelectedNode,
  liveNeighborLines,
  type LitEntry,
} from "../../../src/features/map/live-map";

describe("stripPictographs", () => {
  it.each([
    ["💽 Back_Talk_Bouncer", "Back_Talk_Bouncer"],
    ["Valentine 🐶", "Valentine"],
    ["🇨🇦 Ottawa", "Ottawa"],
    ["👍🏽", ""],
    ["👨‍👩‍👧  Home  Base", "Home Base"],
    ["Keycap 1️⃣", "Keycap 1"],
    ["Plain Name", "Plain Name"],
  ])("%s -> %s", (input, out) => expect(stripPictographs(input)).toBe(out));
});

describe("nodeGlow", () => {
  it("is full at the crossing and fades linearly over 900 ms", () => {
    expect(nodeGlow(1000, 1000)).toBe(1);
    expect(nodeGlow(1000, 1450)).toBeCloseTo(0.5);
    expect(nodeGlow(1000, 1900)).toBe(0);
    expect(nodeGlow(1000, 5000)).toBe(0);
  });
});

describe("idleDotTypes", () => {
  it("shows repeaters and companions for All, otherwise only the filtered type", () => {
    expect(idleDotTypes("")).toEqual(["repeater", "companion"]);
    expect(idleDotTypes("repeater")).toEqual(["repeater"]);
    expect(idleDotTypes("companion")).toEqual(["companion"]);
  });
});

describe("litFeatureCollection", () => {
  it("returns lit nodes with their glow and lit order, and drops faded ones", () => {
    const lit = new Map<string, LitEntry>();
    lightNode(lit, { id: "a", nodeTypeName: "repeater", label: "A", lng: 1, lat: 2, crossedAt: 0, seq: 1 });
    lightNode(lit, { id: "b", nodeTypeName: "companion", label: "B", lng: 3, lat: 4, crossedAt: 600, seq: 2 });
    const fc = litFeatureCollection(lit, 900);
    expect(fc.features.map((f) => f.properties.id)).toEqual(["b"]);
    expect(fc.features[0]!.properties).toMatchObject({ seq: 2, label: "B", nodeTypeName: "companion" });
    expect(fc.features[0]!.properties.glow).toBeCloseTo(2 / 3);
    expect(fc.features[0]!.geometry.coordinates).toEqual([3, 4]);
    expect(lit.has("a")).toBe(false);
  });

  it("re-lighting a node gives it the new lit order", () => {
    const lit = new Map<string, LitEntry>();
    lightNode(lit, { id: "a", nodeTypeName: "repeater", label: "A", lng: 1, lat: 2, crossedAt: 0, seq: 1 });
    lightNode(lit, { id: "a", nodeTypeName: "repeater", label: "A", lng: 1, lat: 2, crossedAt: 100, seq: 5 });
    expect(litFeatureCollection(lit, 100).features[0]!.properties).toMatchObject({ seq: 5, glow: 1 });
  });
});

describe("buildLiveNodeIndex", () => {
  it("indexes every node by id with type and name", () => {
    const fc = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [1, 2] },
          properties: { id: "x", name: "X", nodeTypeName: "sensor", isObserver: false },
        },
      ],
    };
    expect(buildLiveNodeIndex(fc).get("x")).toEqual({ nodeTypeName: "sensor", name: "X" });
  });
});

describe("withSelectedNode", () => {
  const feat = (id: string, nodeTypeName: string) => ({
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [1, 2] },
    properties: { id, name: id, nodeTypeName, isObserver: false },
  });
  const base = { type: "FeatureCollection" as const, features: [feat("r", "repeater"), feat("c", "companion")] };
  const filtered = { type: "FeatureCollection" as const, features: [feat("r", "repeater")] };

  it("adds the selected node back when the type filter hid it", () => {
    expect(withSelectedNode(filtered, base, "c").features.map((f) => f.properties.id)).toEqual(["r", "c"]);
  });
  it("returns the filtered set unchanged when nothing needs adding", () => {
    expect(withSelectedNode(filtered, base, "r")).toBe(filtered);
    expect(withSelectedNode(filtered, base, null)).toBe(filtered);
    expect(withSelectedNode(filtered, base, "gone")).toBe(filtered);
  });
});

describe("liveNeighborLines", () => {
  it("turns all-node lines into selected-node lines while Live is on", () => {
    expect(liveNeighborLines("on", true)).toBe("selected");
    expect(liveNeighborLines("selected", true)).toBe("selected");
    expect(liveNeighborLines("off", true)).toBe("off");
  });
  it("leaves the setting alone when Live is off", () => {
    expect(liveNeighborLines("on", false)).toBe("on");
  });
});
