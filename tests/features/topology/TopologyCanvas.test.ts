import { afterEach, describe, expect, it, vi } from "vitest";
import { createRenderer } from "../../../src/features/topology/topology-renderer";
import { buildTopology, LiveTraffic } from "../../../src/features/topology/topology";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { ChartColors } from "../../../src/features/stats/chartTheme";
import type { LiveChatter } from "../../../src/features/topology/chatter";
import type { LiveReport } from "../../../src/features/topology/topology";
import * as topologyGeometry from "../../../src/features/topology/topology";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("topology camera continuity", () => {
  it("keeps pan, angle, zoom and regional focus through a data refresh and resize", () => {
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal("ResizeObserver", class { constructor(cb: ResizeObserverCallback) { callbacks.push(cb); } observe() {} disconnect() {} });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ setTransform: vi.fn() } as unknown as CanvasRenderingContext2D);
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 700 } as DOMRect);
    const node = { id: "a", publicKey: "ab".repeat(32), name: "Repeater", nodeType: 2, iatas: [{ iata: "YKF", lastHeard: 1 }], knownNeighborCount: 0, neighborIds: [] } as unknown as NodeSummary;
    const graph = buildTopology([node]);
    const first = createRenderer(canvas, graph, new LiveTraffic(), {} as ChartColors, vi.fn(), vi.fn())!;
    first.update("", "YKF", "all", false, true);
    first.zoom(2);
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true }));
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    const chosen = first.view();
    first.dispose();
    const refreshed = createRenderer(canvas, buildTopology([{ ...node, name: "Fresh name" }]), new LiveTraffic(), {} as ChartColors, vi.fn(), vi.fn(), chosen)!;
    refreshed.update("", "YKF", "all", false, true);
    expect(refreshed.view()).toEqual(chosen);
    callbacks.at(-1)!([], {} as ResizeObserver);
    expect(refreshed.view()).toEqual(chosen);
    refreshed.fit(false);
    expect(refreshed.view().camera.zoom).not.toBe(chosen.camera.zoom);
    refreshed.dispose();
  });
});

function drawing(width = 1200, height = 700) {
  const frames = new Map<number, FrameRequestCallback>();
  let clock = 0, frameId = 0;
  vi.spyOn(Date, "now").mockImplementation(() => 1000 + clock);
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { frames.set(++frameId, fn); return frameId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const contexts = new Map<HTMLCanvasElement, ReturnType<typeof makeContext>>();
  const makeContext = () => ({
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), drawImage: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), bezierCurveTo: vi.fn(),
    stroke: vi.fn(), fill: vi.fn(), arc: vi.fn<CanvasRenderingContext2D["arc"]>(), rect: vi.fn(), setLineDash: vi.fn(), fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })), font: "",
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function(this: HTMLCanvasElement) {
    const value = makeContext(); contexts.set(this, value);
    return value as unknown as CanvasRenderingContext2D;
  });
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ width, height } as DOMRect);
  const nodes = ["a", "b"].map(id => ({id, publicKey:id.repeat(64), name:id, nodeType:2,nodeTypeName:"repeater",iatas:[{iata:"YKF",lastHeard:1}],knownNeighborCount:1,neighborIds:[id==="a"?"b":"a"]} as NodeSummary));
  const graph = buildTopology(nodes), traffic = new LiveTraffic();
  const colors = { series:["red","green","blue","orange","purple","gray"] } as unknown as ChartColors;
  return {
    canvas, graph, traffic, colors, contexts, frames,
    frame(at: number) { clock = at; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(at)); },
  };
}

describe("topology rendering work", () => {
  it("does not repaint an unchanged idle mesh for a UI activity tick", () => {
    const s=drawing();
    const renderer=createRenderer(s.canvas,s.graph,s.traffic,s.colors,vi.fn(),vi.fn())!;
    try {
      renderer.update("","","all",true,true);s.frame(0);
      renderer.update("","","all",true,true);
      expect(s.frames.size).toBe(0);
    } finally {renderer.dispose();}
  });
  it("coalesces rapid camera input to the same frame budget as animation", () => {
    const s = drawing();
    const renderer = createRenderer(s.canvas,s.graph,s.traffic,s.colors,vi.fn(),vi.fn())!;
    try {
      renderer.update("","","all",false,true); s.frame(0);
      const ctx=s.contexts.get(s.canvas)!; ctx.clearRect.mockClear();
      renderer.zoom(1.1); s.frame(8);
      renderer.zoom(1.1); s.frame(16);
      renderer.zoom(1.1); s.frame(24);
      expect(ctx.clearRect).not.toHaveBeenCalled();
      s.frame(34);
      expect(ctx.clearRect).toHaveBeenCalled();
    } finally {renderer.dispose();}
  });
  it("reuses active flow geometry between frames without freezing packet animation", () => {
    const s = drawing();
    const geometry = vi.spyOn(topologyGeometry, "pathControls");
    s.traffic.add({key:"packet",at:1000,kind:"text",segments:[["a","b"]]} as LiveReport);
    const renderer = createRenderer(s.canvas,s.graph,s.traffic,s.colors,vi.fn(),vi.fn())!;
    try {
      renderer.update("","","all",true,true); s.frame(0);
      geometry.mockClear();
      const ctx = s.contexts.get(s.canvas)!; ctx.arc.mockClear();
      s.frame(34); s.frame(68);
      expect(geometry).not.toHaveBeenCalled();
      expect(ctx.arc.mock.calls.filter(call => call[2] === 2.8)).toHaveLength(2);
      renderer.zoom(1.1); s.frame(102);
      expect(geometry).toHaveBeenCalled();
    } finally { renderer.dispose(); }
  });
  it("copies rounded backing pixels without resampling on fractional-DPR phones", () => {
    const previous = Object.getOwnPropertyDescriptor(window,"devicePixelRatio")!;
    Object.defineProperty(window,"devicePixelRatio",{configurable:true,value:1.25});
    const s = drawing(390,640);
    const renderer = createRenderer(s.canvas,s.graph,s.traffic,s.colors,vi.fn(),vi.fn())!;
    try {
      renderer.update("","","all",false,true); s.frame(0);
      expect(s.canvas.width).toBe(488);
      expect(s.contexts.get(s.canvas)!.drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement),0,0,390.4,640);
    } finally { renderer.dispose(); Object.defineProperty(window,"devicePixelRatio",previous); }
  });

  it("updates and removes trails without repainting the graph, then invalidates on camera changes", () => {
    const s = drawing();
    const renderer = createRenderer(s.canvas,s.graph,s.traffic,s.colors,vi.fn(),vi.fn())!;
    renderer.update("","","all",false,true); s.frame(0);
    const ctx = s.contexts.get(s.canvas)!;
    expect(ctx.arc).toHaveBeenCalled();
    ctx.arc.mockClear(); ctx.bezierCurveTo.mockClear();
    s.traffic.add({key:"packet",at:1000,kind:"text",segments:[["a","b"]]} as LiveReport);
    renderer.update("","","all",false,true); s.frame(34);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.bezierCurveTo).toHaveBeenCalledTimes(1);
    ctx.bezierCurveTo.mockClear();
    s.traffic.prune(61000); renderer.update("","","all",false,true); s.frame(61000);
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.bezierCurveTo).not.toHaveBeenCalled();
    renderer.zoom(1.2); s.frame(61034);
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.bezierCurveTo).toHaveBeenCalled();
    renderer.dispose();
    for (const canvas of s.contexts.keys()) if (canvas !== s.canvas) expect([canvas.width,canvas.height]).toEqual([0,0]);
  });

  it("keeps moving packet cores and glows in all display modes and stops when inactive", () => {
    const s = drawing();
    s.traffic.add({key:"packet",at:1000,kind:"text",segments:[["a","b"]]} as LiveReport);
    const renderer = createRenderer(s.canvas,s.graph,s.traffic,s.colors,vi.fn(),vi.fn())!;
    const ctx = s.contexts.get(s.canvas)!;
    for (const [i,display] of (["all","bundled","selected"] as const).entries()) {
      ctx.arc.mockClear(); renderer.update("a","",display,true,true); s.frame(i*34);
      expect(ctx.arc.mock.calls.some(call => call[2] === 8)).toBe(true);
      expect(ctx.arc.mock.calls.some(call => call[2] === 2.8)).toBe(true);
    }
    renderer.update("a","","all",true,false);
    expect(s.frames.size).toBe(0);
    renderer.dispose();
  });

  it("reuses chat text layout while fading, and remeasures edits and loaded fonts", () => {
    const s = drawing();
    const bubble = {hash:"chat",sender:"Sender",content:"A Public message",nodeId:"a",at:1000,heardAt:1000};
    const chatter = {visible:() => [bubble]} as unknown as LiveChatter;
    const oldFonts = Object.getOwnPropertyDescriptor(document,"fonts");
    const fonts = new EventTarget();
    Object.defineProperty(document,"fonts",{configurable:true,value:fonts});
    const renderer = createRenderer(s.canvas,s.graph,s.traffic,s.colors,vi.fn(),vi.fn(),undefined,chatter)!;
    try {
      renderer.update("","","all",true,true); s.frame(0);
      const ctx = s.contexts.get(s.canvas)!;
      expect(ctx.measureText).toHaveBeenCalled(); ctx.measureText.mockClear();
      s.frame(34); expect(ctx.measureText).not.toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalledWith("Sender",expect.any(Number),expect.any(Number),expect.any(Number));
      bubble.content = "A changed Public message";
      s.frame(68); expect(ctx.measureText).toHaveBeenCalled(); ctx.measureText.mockClear();
      fonts.dispatchEvent(new Event("loadingdone")); s.frame(102);
      expect(ctx.measureText).toHaveBeenCalled();
    } finally {
      renderer.dispose();
      if (oldFonts) Object.defineProperty(document,"fonts",oldFonts);
      else delete (document as unknown as {fonts?: EventTarget}).fonts;
    }
  });
});
