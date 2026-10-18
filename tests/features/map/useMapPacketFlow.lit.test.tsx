import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { WsManager } from "../../../src/api/ws-manager";
import type { WsPacketObservation } from "../../../src/types/ws";
import type { ResolvedHop } from "../../../src/types/api";
import type { LiveNodeInfo } from "../../../src/features/map/live-map";
import {
  PACKET_FLOW_TRAIL_LAYER_ID,
  PACKET_FLOW_DOT_HALO_LAYER_ID,
  PACKET_FLOW_DOT_LAYER_ID,
  PACKET_FLOW_HOP_MS,
  LIVE_LIT_SOURCE_ID,
  LIVE_LIT_LABEL_LAYER_ID,
  LIVE_LIT_ICON_LAYER_ID,
} from "../../../src/features/map/types";
import { useMapPacketFlow } from "../../../src/features/map/useMapPacketFlow";

type Handler = (e: unknown) => void;

// map stub with a real layer stack, per-source setData spies and recorded event handlers
function stubMap() {
  const layers: string[] = [];
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const handlers: { type: string; layer?: string; fn: Handler }[] = [];
  const canvas = { style: {} as Record<string, string> };
  const map = {
    getCanvas: () => canvas,
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    addLayer: (spec: { id: string }, beforeId?: string) => {
      const at = beforeId ? layers.indexOf(beforeId) : -1;
      if (at >= 0) layers.splice(at, 0, spec.id);
      else layers.push(spec.id);
    },
    removeLayer: (id: string) => layers.splice(layers.indexOf(id), 1),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string) => sources.set(id, { setData: vi.fn() }),
    removeSource: (id: string) => sources.delete(id),
    setPaintProperty: vi.fn(),
    on: (type: string, a: string | Handler, b?: Handler) =>
      handlers.push(typeof a === "string" ? { type, layer: a, fn: b! } : { type, fn: a }),
    off: (type: string, a: string | Handler, b?: Handler) => {
      const fn = typeof a === "string" ? b : a;
      const i = handlers.findIndex((h) => h.type === type && h.fn === fn);
      if (i >= 0) handlers.splice(i, 1);
    },
  };
  const lastLit = () => {
    const calls = sources.get(LIVE_LIT_SOURCE_ID)?.setData.mock.calls ?? [];
    return calls.at(-1)?.[0] as { features: { properties: Record<string, unknown> }[] } | undefined;
  };
  return { map: map as unknown as MapLibreMap, layers, sources, handlers, lastLit };
}

function hop(id: string, lng: number, lat: number): ResolvedHop {
  return { confidence: "high", nodes: [{ id, publicKey: "pk", longitude: lng, latitude: lat }] };
}

function fakeWs() {
  let handler: ((d: WsPacketObservation["data"]) => void) | null = null;
  const ws = {
    setResolvePath: vi.fn(),
    onPacketObservation: (cb: (d: WsPacketObservation["data"]) => void) => {
      handler = cb;
      return () => {
        handler = null;
      };
    },
  } as unknown as WsManager;
  const emit = (path: ResolvedHop[]) =>
    handler?.({ observation: { resolvedPath: path, resolvedSource: null, resolvedDestination: null } } as unknown as WsPacketObservation["data"]);
  return { ws, emit };
}

let now = 0;
let rafs = new Map<number, FrameRequestCallback>();
let rafId = 0;
function frame(t: number) {
  now = t;
  const due = [...rafs.values()];
  rafs = new Map();
  due.forEach((cb) => cb(t));
}

beforeEach(() => {
  now = 0;
  rafs = new Map();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafs.set(++rafId, cb);
    return rafId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafs.delete(id));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const index = new Map<string, LiveNodeInfo>([
  ["r1", { nodeTypeName: "repeater", name: "💽 R1" }],
  ["r2", { nodeTypeName: "repeater", name: "R2" }],
]);

function setup(onSelect = vi.fn()) {
  const m = stubMap();
  const { ws, emit } = fakeWs();
  const view = renderHook(
    ({ enabled, themeKey, resetKey }) =>
      useMapPacketFlow({ current: m.map }, true, enabled, ws, themeKey, resetKey, true, index, onSelect),
    { initialProps: { enabled: true, themeKey: "dark", resetKey: "r" } },
  );
  return { ...m, emit, view, onSelect };
}

const ORDER = [
  PACKET_FLOW_TRAIL_LAYER_ID,
  LIVE_LIT_LABEL_LAYER_ID,
  LIVE_LIT_ICON_LAYER_ID,
  PACKET_FLOW_DOT_HALO_LAYER_ID,
  PACKET_FLOW_DOT_LAYER_ID,
];

describe("useMapPacketFlow lit nodes", () => {
  it("stacks trail < lit labels < lit icons < dot halo < dot, also after a basemap switch", () => {
    const { layers, sources, view } = setup();
    expect(layers).toEqual(ORDER);
    // a basemap switch drops every custom layer and source; the effect rebuilds them in order
    layers.length = 0;
    sources.clear();
    view.rerender({ enabled: true, themeKey: "light", resetKey: "r" });
    expect(layers).toEqual(ORDER);
  });

  it("lights crossed nodes in lit order, labels them without emoji, and fades each one", () => {
    const { emit, lastLit } = setup();
    emit([hop("r1", -75, 45), hop("r2", -74, 45)]);
    frame(0);
    expect(lastLit()!.features.map((f) => f.properties)).toEqual([
      { id: "r1", nodeTypeName: "repeater", label: "R1", seq: 1, glow: 1 },
    ]);
    frame(PACKET_FLOW_HOP_MS);
    const byId = Object.fromEntries(lastLit()!.features.map((f) => [f.properties.id, f.properties]));
    expect(byId["r2"]).toMatchObject({ seq: 2, glow: 1, label: "R2" });
    expect(byId["r1"]!.glow).toBeCloseTo(1 - PACKET_FLOW_HOP_MS / 900);
    frame(PACKET_FLOW_HOP_MS + 900);
    expect(lastLit()!.features).toEqual([]);
  });

  it("skips hops missing from the node index", () => {
    const { emit, lastLit } = setup();
    emit([hop("r1", -75, 45), hop("ghost", -74, 45)]);
    frame(0);
    frame(PACKET_FLOW_HOP_MS);
    expect(lastLit()!.features.map((f) => f.properties.id)).toEqual(["r1"]);
  });

  it("empties the lit source when Live turns off or the region changes", () => {
    const { emit, lastLit, view } = setup();
    emit([hop("r1", -75, 45), hop("r2", -74, 45)]);
    frame(0);
    view.rerender({ enabled: true, themeKey: "dark", resetKey: "other" });
    expect(lastLit()!.features).toEqual([]);
    view.rerender({ enabled: true, themeKey: "dark", resetKey: "other" });
    emit([hop("r1", -75, 45), hop("r2", -74, 45)]);
    frame(10);
    expect(lastLit()!.features).toHaveLength(1);
    view.rerender({ enabled: false, themeKey: "dark", resetKey: "other" });
    expect(lastLit()!.features).toEqual([]);
  });

  it("selects the node when its lit icon is clicked", () => {
    const { handlers, onSelect } = setup();
    const click = handlers.find((h) => h.type === "click" && h.layer === LIVE_LIT_ICON_LAYER_ID);
    click!.fn({ features: [{ properties: { id: "r1", glow: 0.9 } }] });
    expect(onSelect).toHaveBeenCalledWith("r1");
  });

  it("ignores a click on a lit icon that has almost faded", () => {
    const { handlers, onSelect } = setup();
    const click = handlers.find((h) => h.type === "click" && h.layer === LIVE_LIT_ICON_LAYER_ID);
    click!.fn({ features: [{ properties: { id: "r1", glow: 0.05 } }] });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
