import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";

const spiders = vi.hoisted(() => [] as { applyTo: ReturnType<typeof vi.fn>; unspiderfyAll: ReturnType<typeof vi.fn> }[]);

vi.mock("@nazka/map-gl-js-spiderfy", () => ({
  default: class {
    // unspiderfyAll also unbinds the cluster click, so a reset must re-apply on a fresh instance
    applyTo = vi.fn();
    unspiderfyAll = vi.fn();
    constructor() {
      spiders.push(this);
    }
  },
}));

import { useMapNodes } from "../../../src/features/map/useMapNodes";

function stubMap(): MapLibreMap {
  const fns = new Map<PropertyKey, unknown>();
  const canvas = { style: {} as Record<string, string> };
  return new Proxy({} as MapLibreMap, {
    get(_, key) {
      if (key === "getCanvas") return () => canvas;
      if (key === "getSource") return () => ({ setData: vi.fn() });
      if (key === "then") return undefined;
      if (!fns.has(key)) fns.set(key, vi.fn());
      return fns.get(key);
    },
  });
}

describe("useMapNodes spiderfy", () => {
  it("re-applies spiderfy to clusters when the dataset resets", () => {
    const mapRef = { current: stubMap() };
    const iconRef = { current: null };
    const geojson = { type: "FeatureCollection" as const, features: [] };
    const { rerender } = renderHook(
      ({ resetKey }) =>
        useMapNodes(mapRef, iconRef, true, geojson, true, "dark", true, () => {}, null, false, null, resetKey),
      { initialProps: { resetKey: "YOW:all" } },
    );
    const before = spiders.length;

    rerender({ resetKey: "YYZ:all" });

    const latest = spiders[spiders.length - 1]!;
    expect(spiders.length).toBe(before + 1);
    expect(latest.applyTo).toHaveBeenCalled();
    expect(latest.unspiderfyAll).not.toHaveBeenCalled();
  });
});
