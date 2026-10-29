import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

type Handler = (e?: unknown) => void;

const maps = vi.hoisted(() => [] as FakeMap[]);

interface FakeLayer {
  id: string;
  type: string;
  source?: string;
}

interface FakeMap {
  fire: (type: string, e?: unknown) => void;
  fitBounds: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
  sources: Record<string, { type: string; tiles?: string[] }>;
  layers: FakeLayer[];
  terrain: { source: string; exaggeration?: number } | null;
}

// the basemap's own label layer; hillshade has to slot in beneath it
const BASEMAP_LABELS = vi.hoisted(() => ({ id: "basemap-labels", type: "symbol" }));

vi.mock("../../../src/features/map/maplibre-worker", () => ({}));
vi.mock("maplibre-gl", () => {
  class Map {
    handlers: Record<string, Handler[]> = {};
    fitBounds = vi.fn();
    flyTo = vi.fn();
    sources: FakeMap["sources"] = {};
    layers: FakeLayer[] = [BASEMAP_LABELS];
    terrain: FakeMap["terrain"] = null;
    // like maplibre, a new style drops everything that was added by hand
    setStyle = vi.fn(() => {
      this.sources = {};
      this.layers = [BASEMAP_LABELS];
      this.terrain = null;
    });
    constructor() {
      maps.push(this as unknown as FakeMap);
    }
    on(type: string, fn: Handler) {
      (this.handlers[type] ??= []).push(fn);
    }
    fire(type: string, e?: unknown) {
      for (const fn of this.handlers[type] ?? []) fn(e);
    }
    addControl() {}
    getContainer() {
      return document.createElement("div");
    }
    setMissingStyleImageResolver() {}
    addSource(id: string, spec: FakeMap["sources"][string]) {
      if (this.sources[id]) throw new Error(`source ${id} exists`);
      this.sources[id] = spec;
    }
    removeSource(id: string) {
      if (this.terrain?.source === id || this.layers.some((l) => l.source === id)) throw new Error(`source ${id} in use`);
      delete this.sources[id];
    }
    getSource(id: string) {
      return this.sources[id];
    }
    addLayer(layer: FakeLayer, beforeId?: string) {
      const at = beforeId ? this.layers.findIndex((l) => l.id === beforeId) : -1;
      if (at < 0) this.layers.push(layer);
      else this.layers.splice(at, 0, layer);
    }
    removeLayer(id: string) {
      this.layers = this.layers.filter((l) => l.id !== id);
    }
    getLayer(id: string) {
      return this.layers.find((l) => l.id === id);
    }
    getStyle() {
      return { layers: this.layers };
    }
    setTerrain(terrain: FakeMap["terrain"]) {
      if (terrain && !this.sources[terrain.source]) throw new Error(`no source ${terrain.source}`);
      this.terrain = terrain;
    }
    getTerrain() {
      return this.terrain;
    }
    remove() {}
  }
  class LngLatBounds {
    extend() {
      return this;
    }
  }
  class Control {}
  return { Map, LngLatBounds, NavigationControl: Control, ScaleControl: Control, AttributionControl: Control };
});

const { useMapLibre } = await import("../../../src/features/map/useMapLibre");
const { resolveMapStyle } = await import("../../../src/features/map/types");

const camera = { center: [-75.7, 45.4] as [number, number], zoom: 9 };

function mount(props: { styleId?: string; fitPoints: [number, number][] | null; fitScope?: string; onStyleError?: (id: string) => void; terrain?: boolean }) {
  const hook = renderHook(
    (p: typeof props) => {
      const r = useMapLibre(p.styleId ?? "dark", p.fitPoints, p.onStyleError, camera, p.fitScope, p.terrain);
      // the map attaches to the container ref, so hand it a node before the init effect runs
      if (!r.containerRef.current) r.containerRef.current = document.createElement("div");
      return r;
    },
    { initialProps: props },
  );
  const map = maps[maps.length - 1]!;
  act(() => map.fire("load"));
  return { ...hook, map };
}

beforeEach(() => {
  maps.length = 0;
});

describe("useMapLibre deep-link fit", () => {
  it("keeps the deep-link camera over the first fit of the linked region", () => {
    const { map, rerender } = mount({ fitPoints: null, fitScope: "ottawa" });
    rerender({ fitPoints: [[-75.7, 45.3]], fitScope: "ottawa" });
    expect(map.fitBounds).not.toHaveBeenCalled();
  });

  it("frames a newly selected region when the linked one had no airport coords", () => {
    const { map, rerender } = mount({ fitPoints: null, fitScope: "nowhere" });
    rerender({ fitPoints: [[-79.6, 43.7]], fitScope: "toronto" });
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });
});

describe("useMapLibre basemap swap errors", () => {
  function swap(onStyleError: (id: string) => void) {
    const { map, rerender } = mount({ fitPoints: null, onStyleError });
    rerender({ styleId: "liberty", fitPoints: null, onStyleError });
    expect(map.setStyle).toHaveBeenCalled();
    return map;
  }

  it("ignores a sprite failure while the new style is still loading", () => {
    const onStyleError = vi.fn();
    const map = swap(onStyleError);
    act(() =>
      map.fire("error", { error: Object.assign(new Error("sprite"), { status: 404, url: "https://tiles.example/sprite.json" }) }),
    );
    expect(onStyleError).not.toHaveBeenCalled();
  });

  it("reverts when the style document itself fails to load", () => {
    const onStyleError = vi.fn();
    const map = swap(onStyleError);
    act(() =>
      map.fire("error", { error: Object.assign(new Error("offline"), { status: 0, url: resolveMapStyle("liberty").url }) }),
    );
    expect(onStyleError).toHaveBeenCalledWith("dark");
  });
});

describe("useMapLibre terrain", () => {
  const demTiles = (map: FakeMap) =>
    Object.values(map.sources).filter((src) => src.tiles?.some((t) => t.includes("elevation-tiles-prod")));
  const layerIds = (map: FakeMap) => map.layers.map((l) => l.id);

  function expectNoTerrain(map: FakeMap) {
    expect(demTiles(map)).toHaveLength(0);
    expect(map.sources).toEqual({});
    expect(layerIds(map)).toEqual(["basemap-labels"]);
    expect(map.terrain).toBeNull();
  }

  function expectTerrain(map: FakeMap) {
    expect(Object.keys(map.sources).sort()).toEqual(["hillshade-dem", "terrain-dem"]);
    expect(demTiles(map)).toHaveLength(2);
    expect(layerIds(map)).toEqual(["hillshade", "basemap-labels"]);
    expect(map.terrain).toEqual({ source: "terrain-dem", exaggeration: 1.5 });
  }

  it("adds no terrain or hillshade by default", () => {
    const { map } = mount({ fitPoints: null });
    expectNoTerrain(map);
  });

  it("adds terrain and hillshade when switched on, and removes them when switched off", () => {
    const { map, rerender } = mount({ fitPoints: null });
    rerender({ fitPoints: null, terrain: true });
    expectTerrain(map);
    rerender({ fitPoints: null, terrain: false });
    expectNoTerrain(map);
  });

  it("adds terrain on the first load when it starts on", () => {
    const { map } = mount({ fitPoints: null, terrain: true });
    expectTerrain(map);
  });

  it("re-adds terrain after a basemap swap only while it is on", () => {
    const { map, rerender } = mount({ fitPoints: null, terrain: true });
    rerender({ styleId: "liberty", fitPoints: null, terrain: true });
    act(() => map.fire("style.load"));
    expectTerrain(map);
    rerender({ styleId: "liberty", fitPoints: null, terrain: false });
    rerender({ styleId: "positron", fitPoints: null, terrain: false });
    act(() => map.fire("style.load"));
    expectNoTerrain(map);
  });

  it("applies a switch made mid-swap once the new style loads", () => {
    const { map, rerender } = mount({ fitPoints: null });
    rerender({ styleId: "liberty", fitPoints: null });
    rerender({ styleId: "liberty", fitPoints: null, terrain: true });
    expectNoTerrain(map);
    act(() => map.fire("style.load"));
    expectTerrain(map);
  });
});
