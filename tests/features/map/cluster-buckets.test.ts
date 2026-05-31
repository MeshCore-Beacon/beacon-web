import { describe, it, expect } from "vitest";
import {
  CLUSTER_ICON_ID,
  CLUSTER_BUCKETS,
  CLUSTER_ICON_IDS,
  clusterIconImageExpression,
} from "../../../src/features/map/types";
import { MAP_ICON_IDS } from "../../../src/features/map/node-icons";

describe("CLUSTER_BUCKETS", () => {
  it("starts at the floor and stays ascending by minCount", () => {
    expect(CLUSTER_BUCKETS[0]!.minCount).toBe(0);
    for (let i = 1; i < CLUSTER_BUCKETS.length; i++) {
      expect(CLUSTER_BUCKETS[i]!.minCount).toBeGreaterThan(CLUSTER_BUCKETS[i - 1]!.minCount);
    }
  });

  it("lights an ascending 1..12 number of gauge segments", () => {
    for (let i = 0; i < CLUSTER_BUCKETS.length; i++) {
      const { lit } = CLUSTER_BUCKETS[i]!;
      expect(lit).toBeGreaterThanOrEqual(1);
      expect(lit).toBeLessThanOrEqual(12);
      if (i > 0) expect(lit).toBeGreaterThan(CLUSTER_BUCKETS[i - 1]!.lit);
    }
  });

  it("has unique ids, the first being CLUSTER_ICON_ID", () => {
    expect(new Set(CLUSTER_ICON_IDS).size).toBe(CLUSTER_ICON_IDS.length);
    expect(CLUSTER_ICON_IDS[0]).toBe(CLUSTER_ICON_ID);
  });

  it("registers every density level in MAP_ICON_IDS so the images exist before the layer needs them", () => {
    expect(CLUSTER_ICON_IDS.every((id) => MAP_ICON_IDS.includes(id))).toBe(true);
  });
});

describe("clusterIconImageExpression", () => {
  it("builds a step expression with the floor bucket as the pre-first-stop default", () => {
    expect(clusterIconImageExpression()).toEqual([
      "step",
      ["get", "point_count"],
      "node-cluster",
      5,
      "node-cluster-2",
      15,
      "node-cluster-3",
      25,
      "node-cluster-4",
      50,
      "node-cluster-5",
      100,
      "node-cluster-6",
    ]);
  });
});
