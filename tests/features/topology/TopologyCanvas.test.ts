import { afterEach, describe, expect, it, vi } from "vitest";
import { createRenderer } from "../../../src/features/topology/topology-renderer";
import { buildTopology, LiveTraffic } from "../../../src/features/topology/topology";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { ChartColors } from "../../../src/features/stats/chartTheme";

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
