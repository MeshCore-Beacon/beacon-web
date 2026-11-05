import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { buildRepeaterScopeStyle } from "../../../src/features/map/repeater-scopes";
import { nodesToFeatureCollection } from "../../../src/features/map/node-geojson";
import type { NodeSummary } from "../../../src/features/nodes/types";
import { NODES_SOURCE_ID } from "../../../src/features/map/types";

const spiders = vi.hoisted(() => [] as { unspiderfyAll: ReturnType<typeof vi.fn> }[]);
vi.mock("@nazka/map-gl-js-spiderfy", () => ({ default: class {
  applyTo = vi.fn(); unspiderfyAll = vi.fn();
  constructor() { spiders.push(this); }
} }));
vi.mock("../../../src/features/map/node-icons", async importOriginal => ({
  ...await importOriginal<typeof import("../../../src/features/map/node-icons")>(),
  rasterizeNodeIcon: vi.fn(async () => ({ data: {} as ImageData, pixelRatio: 1 })),
}));
import { useMapNodes } from "../../../src/features/map/useMapNodes";

function fixtureMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Map<string, { id: string; source?: string }>();
  const images = new Set<string>();
  const map = {
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
    removeSource: vi.fn((id: string) => {
      if ([...layers.values()].some(l => l.source === id)) throw new Error("Source still has layers");
      sources.delete(id);
    }),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: { id: string; source?: string }) => layers.set(layer.id, layer)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    hasImage: vi.fn((id: string) => images.has(id)), addImage: vi.fn((id: string) => images.add(id)), removeImage: vi.fn((id: string) => images.delete(id)),
    getStyle: vi.fn(() => ({ layers: [...layers.values()] })),
    getCanvas: vi.fn(() => ({ style: {} })), querySourceFeatures: vi.fn(() => []),
    setLayoutProperty: vi.fn(), setPaintProperty: vi.fn(), setFilter: vi.fn(), on: vi.fn(), off: vi.fn(),
  };
  return map;
}

describe("scope layer lifecycle", () => {
  it("rebuilds cluster aggregates on toggle, retains them for ordinary data updates, and retires scope sprites", async () => {
    const map = fixtureMap();
    const mapRef = { current: map as unknown as MapLibreMap };
    const iconRef = { current: null };
    const fc = nodesToFeatureCollection([{ id: "a", name: "A", publicKey: "a", nodeType: 2, nodeTypeName: "repeater", lat: 43, lng: -80, iatas: [], knownNeighborCount: 0, defaultScope: "#on" } as NodeSummary]);
    const style = buildRepeaterScopeStyle(fc, true);
    const { rerender, unmount } = renderHook(({ enabled, data, clustered }) =>
      useMapNodes(mapRef, iconRef, true, data, true, "dark", clustered, () => {}, null, false, null, "YKF", undefined, true, enabled ? buildRepeaterScopeStyle(data, true) : null),
    { initialProps: { enabled: false, data: fc, clustered: true } });
    await waitFor(() => expect(map.addImage).toHaveBeenCalled());
    const sourcesBefore = map.addSource.mock.calls.filter(c => c[0] === NODES_SOURCE_ID).length;
    const spiderBefore = spiders.at(-1)!;
    rerender({ enabled: true, data: fc, clustered: true });
    await waitFor(() => expect(map.hasImage(style.imageIds[0]!)).toBe(true));
    expect(spiderBefore.unspiderfyAll).toHaveBeenCalled();
    expect(map.removeSource).toHaveBeenCalledWith(NODES_SOURCE_ID);
    expect(map.addSource.mock.calls.filter(c => c[0] === NODES_SOURCE_ID)).toHaveLength(sourcesBefore + 1);
    const styledArgs = map.addSource.mock.calls.filter(c => c[0] === NODES_SOURCE_ID).at(-1)! as unknown as [string, { clusterProperties: unknown }];
    expect(styledArgs[1].clusterProperties).toEqual(style.clusterProperties);
    // Live Map temporarily disables clustering. Keep the already-loaded sprites
    // across that source recreation or scoped markers disappear on return.
    map.removeImage.mockClear();
    rerender({ enabled: true, data: fc, clustered: false });
    expect(map.removeImage).not.toHaveBeenCalled();
    for (const id of style.imageIds) expect(map.hasImage(id)).toBe(true);
    const removed = map.removeSource.mock.calls.length;
    rerender({ enabled: true, clustered: false, data: { ...fc, features: fc.features.map(f => ({ ...f, properties: { ...f.properties, name: "Renamed" } })) } });
    expect(map.removeSource).toHaveBeenCalledTimes(removed);
    rerender({ enabled: false, data: fc, clustered: false });
    for (const id of style.imageIds) expect(map.removeImage).toHaveBeenCalledWith(id);
    unmount();
    expect(map.off.mock.calls.filter(c => c[0] === "click").length).toBe(map.on.mock.calls.filter(c => c[0] === "click").length);
  });
});
