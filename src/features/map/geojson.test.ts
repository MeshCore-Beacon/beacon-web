import { describe, expect, it } from "vitest";
import { livePulsesToGeoJSON, nodesToGeoJSON, routesToGeoJSON } from "./geojson";
import type { LiveRoutePulse, TowerMapNode, TowerMapRoute } from "./types";

describe("map GeoJSON builders", () => {
  it("keeps only mappable node coordinates", () => {
    const nodes: TowerMapNode[] = [
      node({ id: "a", lat: 45, lng: -75 }),
      node({ id: "b", lat: 0, lng: 0 }),
    ];

    expect(nodesToGeoJSON(nodes).features.map((feature) => feature.id)).toEqual(["a"]);
  });

  it("excludes routes without high confidence", () => {
    const routes: TowerMapRoute[] = [
      route({ id: "high", resolutionQuality: "high" }),
      route({ id: "ambiguous", resolutionQuality: "ambiguous" }),
    ];

    expect(routesToGeoJSON(routes).features.map((feature) => feature.id)).toEqual(["high"]);
  });

  it("expires live pulses from the live layer", () => {
    const pulses: LiveRoutePulse[] = [
      pulse({ id: "active", expiresAt: 2_000 }),
      pulse({ id: "expired", expiresAt: 900 }),
    ];

    expect(livePulsesToGeoJSON(pulses, 1_000).features.map((feature) => feature.id)).toEqual(["active"]);
  });
});

function node(overrides: Partial<TowerMapNode>): TowerMapNode {
  return {
    id: "node",
    label: "Node",
    role: "repeater",
    lat: 45,
    lng: -75,
    firstSeen: 1,
    lastSeen: 1,
    iatasHeardIn: ["YOW"],
    activityCount: 1,
    ...overrides,
  };
}

function route(overrides: Partial<TowerMapRoute>): TowerMapRoute {
  return {
    id: "route",
    from: { nodeId: "a", label: "A", lat: 45, lng: -75 },
    to: { nodeId: "b", label: "B", lat: 46, lng: -76 },
    packetCount: 1,
    lastHeard: 1,
    payloadTypeNames: ["Advert"],
    resolutionQuality: "high",
    ...overrides,
  };
}

function pulse(overrides: Partial<LiveRoutePulse>): LiveRoutePulse {
  return {
    id: "pulse",
    fromLat: 45,
    fromLng: -75,
    toLat: 46,
    toLng: -76,
    payloadTypeName: "Advert",
    heardAt: 1_000,
    expiresAt: 2_000,
    ...overrides,
  };
}
