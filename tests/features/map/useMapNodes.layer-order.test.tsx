import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  NODES_CLUSTER_LAYER_ID,
  NODES_POINT_LAYER_ID,
  NODES_SELECTED_LAYER_ID,
  LIVE_DOTS_LAYER_ID,
  LIVE_LIT_ICON_LAYER_ID,
  PACKET_FLOW_TRAIL_LAYER_ID,
  PACKET_FLOW_DOT_HALO_LAYER_ID,
  PACKET_FLOW_DOT_LAYER_ID,
} from "../../../src/features/map/types";

vi.mock("@nazka/map-gl-js-spiderfy", () => ({
  default: class {
    applyTo = vi.fn();
    unspiderfyAll = vi.fn();
  },
}));

import { useMapNodes } from "../../../src/features/map/useMapNodes";

// map stub that keeps a real layer stack so addLayer's beforeId placement can be asserted
function stackMap(layers: string[]): MapLibreMap {
  const sources = new Set<string>();
  const fns = new Map<PropertyKey, unknown>();
  const canvas = { style: {} as Record<string, string> };
  const impl: Record<string, unknown> = {
    getCanvas: () => canvas,
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    addLayer: (spec: { id: string }, beforeId?: string) => {
      const at = beforeId ? layers.indexOf(beforeId) : -1;
      if (at >= 0) layers.splice(at, 0, spec.id);
      else layers.push(spec.id);
    },
    removeLayer: (id: string) => layers.splice(layers.indexOf(id), 1),
    getSource: (id: string) => (sources.has(id) ? { setData: vi.fn() } : undefined),
    addSource: (id: string) => sources.add(id),
    removeSource: (id: string) => sources.delete(id),
    getStyle: () => ({ layers: layers.map((id) => ({ id })) }),
  };
  return new Proxy({} as MapLibreMap, {
    get(_, key) {
      if (typeof key === "string" && key in impl) return impl[key];
      if (key === "then") return undefined;
      if (!fns.has(key)) fns.set(key, vi.fn());
      return fns.get(key);
    },
  });
}

describe("useMapNodes layer order", () => {
  it("keeps node layers beneath the packet-flow layers after a clustering toggle", () => {
    const layers: string[] = [];
    const mapRef = { current: stackMap(layers) };
    const geojson = { type: "FeatureCollection" as const, features: [] };
    const { rerender } = renderHook(
      ({ clustered }) =>
        useMapNodes(mapRef, { current: null }, true, geojson, true, "dark", clustered, () => {}, null, true, null),
      { initialProps: { clustered: true } },
    );
    // packet flow builds its layers after the nodes, on top
    layers.push(PACKET_FLOW_TRAIL_LAYER_ID, PACKET_FLOW_DOT_HALO_LAYER_ID, PACKET_FLOW_DOT_LAYER_ID);

    rerender({ clustered: false });

    const trail = layers.indexOf(PACKET_FLOW_TRAIL_LAYER_ID);
    expect(layers.indexOf(NODES_CLUSTER_LAYER_ID)).toBeLessThan(trail);
    expect(layers.indexOf(NODES_POINT_LAYER_ID)).toBeLessThan(trail);
    expect(layers.indexOf(NODES_CLUSTER_LAYER_ID)).toBeLessThan(layers.indexOf(NODES_POINT_LAYER_ID));
  });

  it("puts the idle dots beneath the selected ring, the markers and the packet trail, also after a clustering toggle", () => {
    const layers: string[] = [];
    const mapRef = { current: stackMap(layers) };
    const geojson = { type: "FeatureCollection" as const, features: [] };
    const { rerender } = renderHook(
      ({ clustered }) =>
        useMapNodes(mapRef, { current: null }, true, geojson, true, "dark", clustered, () => {}, null, true, null),
      { initialProps: { clustered: true } },
    );
    layers.push(PACKET_FLOW_TRAIL_LAYER_ID, PACKET_FLOW_DOT_HALO_LAYER_ID, PACKET_FLOW_DOT_LAYER_ID);
    const check = () => {
      const dots = layers.indexOf(LIVE_DOTS_LAYER_ID);
      expect(dots).toBeGreaterThanOrEqual(0);
      expect(dots).toBeLessThan(layers.indexOf(NODES_SELECTED_LAYER_ID));
      expect(layers.indexOf(NODES_SELECTED_LAYER_ID)).toBeLessThan(layers.indexOf(NODES_POINT_LAYER_ID));
      expect(layers.indexOf(NODES_POINT_LAYER_ID)).toBeLessThan(layers.indexOf(PACKET_FLOW_TRAIL_LAYER_ID));
    };
    check();
    rerender({ clustered: false });
    check();
  });

  it("in Live shows the dots and only the selected node's marker; off again restores the markers", () => {
    const map = stackMap([]);
    const geojson = { type: "FeatureCollection" as const, features: [] };
    const { rerender } = renderHook(
      ({ live }) => useMapNodes({ current: map }, { current: null }, true, geojson, true, "dark", false, () => {}, "n1", live, null),
      { initialProps: { live: true } },
    );
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(LIVE_DOTS_LAYER_ID, "visibility", "visible");
    expect(map.setFilter).toHaveBeenCalledWith(NODES_POINT_LAYER_ID, ["all", ["!", ["has", "point_count"]], ["==", ["get", "id"], "n1"]]);
    rerender({ live: false });
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith(LIVE_DOTS_LAYER_ID, "visibility", "none");
    expect(map.setFilter).toHaveBeenLastCalledWith(NODES_POINT_LAYER_ID, ["!", ["has", "point_count"]]);
  });

  it("filters the dots to the given node types", () => {
    const map = stackMap([]);
    const geojson = { type: "FeatureCollection" as const, features: [] };
    renderHook(() =>
      useMapNodes({ current: map }, { current: null }, true, geojson, true, "dark", false, () => {}, null, true, null, "", ["companion"]),
    );
    expect(map.setFilter).toHaveBeenCalledWith(LIVE_DOTS_LAYER_ID, [
      "all",
      ["!", ["has", "point_count"]],
      ["in", ["get", "nodeTypeName"], ["literal", ["companion"]]],
    ]);
  });

  it("leaves a click to the lit icon drawn over a dot", () => {
    const map = stackMap([LIVE_LIT_ICON_LAYER_ID]);
    const onSelect = vi.fn();
    const geojson = { type: "FeatureCollection" as const, features: [] };
    renderHook(() => useMapNodes({ current: map }, { current: null }, true, geojson, true, "dark", false, onSelect, null, true, null));
    const dotClick = vi.mocked(map.on).mock.calls.find((c) => c[0] === "click" && c[1] === LIVE_DOTS_LAYER_ID)![2] as unknown as (e: unknown) => void;
    vi.mocked(map.queryRenderedFeatures).mockReturnValue([{ properties: { id: "lit", glow: 0.9 } }] as never);
    dotClick({ point: { x: 1, y: 2 }, features: [{ properties: { id: "dot" } }] });
    expect(onSelect).not.toHaveBeenCalled();
    vi.mocked(map.queryRenderedFeatures).mockReturnValue([]);
    dotClick({ point: { x: 1, y: 2 }, features: [{ properties: { id: "dot" } }] });
    expect(onSelect).toHaveBeenCalledWith("dot");
  });

  it("lets a click through a lit icon that has almost faded", () => {
    const map = stackMap([LIVE_LIT_ICON_LAYER_ID]);
    const onSelect = vi.fn();
    const geojson = { type: "FeatureCollection" as const, features: [] };
    renderHook(() => useMapNodes({ current: map }, { current: null }, true, geojson, true, "dark", false, onSelect, null, true, null));
    const dotClick = vi.mocked(map.on).mock.calls.find((c) => c[0] === "click" && c[1] === LIVE_DOTS_LAYER_ID)![2] as unknown as (e: unknown) => void;
    vi.mocked(map.queryRenderedFeatures).mockReturnValue([{ properties: { id: "lit", glow: 0.05 } }] as never);
    dotClick({ point: { x: 1, y: 2 }, features: [{ properties: { id: "dot" } }] });
    expect(onSelect).toHaveBeenCalledWith("dot");
  });
});
