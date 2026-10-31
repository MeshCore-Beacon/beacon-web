import { describe, expect, it, vi } from "vitest";
import { serialize } from "../../../node_modules/maplibre-gl/src/util/web_worker_transfer";
import { nodesToFeatureCollection } from "../../../src/features/map/node-geojson";
import type { NodeSummary } from "../../../src/features/nodes/types";

describe("scope GeoJSON worker transfer", () => {
  it("transfers scope counts and private names through the installed MapLibre serializer", () => {
    vi.stubGlobal("ImageData", class {});
    const node = { id: "a", name: "A", publicKey: "aa", nodeType: 2, nodeTypeName: "repeater", lat: 43, lng: -80,
      scopeEvidence: { since: 0, until: 1, scopes: [{ name: "$name", repeatObservations: 7 }, { name: "constructor", repeatObservations: 2 }] },
      iatas: [], knownNeighborCount: 0 } as NodeSummary;
    expect(() => serialize(nodesToFeatureCollection([node]))).not.toThrow();
  });
});
