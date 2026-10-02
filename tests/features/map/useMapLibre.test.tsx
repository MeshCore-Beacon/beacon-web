import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

type Handler = (e?: unknown) => void;

const maps = vi.hoisted(() => [] as FakeMap[]);

interface FakeMap {
  fire: (type: string, e?: unknown) => void;
  fitBounds: ReturnType<typeof vi.fn>;
  flyTo: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
}

vi.mock("../../../src/features/map/maplibre-worker", () => ({}));
vi.mock("maplibre-gl", () => {
  class Map {
    handlers: Record<string, Handler[]> = {};
    fitBounds = vi.fn();
    flyTo = vi.fn();
    setStyle = vi.fn();
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
    getSource() {
      return {};
    }
    getLayer() {
      return {};
    }
    setTerrain() {}
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

function mount(props: { styleId?: string; fitPoints: [number, number][] | null; fitScope?: string; onStyleError?: (id: string) => void }) {
  const hook = renderHook(
    (p: typeof props) => {
      const r = useMapLibre(p.styleId ?? "dark", p.fitPoints, p.onStyleError, camera, p.fitScope);
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
