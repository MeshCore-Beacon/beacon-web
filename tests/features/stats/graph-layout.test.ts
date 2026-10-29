import { afterEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts/core";
import { GraphChart } from "echarts/charts";
import { SVGRenderer } from "echarts/renderers";
import { forceLayout, seededRandom, type ForceLayoutInput } from "../../../src/features/stats/graph-layout";

echarts.use([GraphChart, SVGRenderer]);

type Edge = [number, number];

function input(count: number, edges: Edge[], over: Partial<ForceLayoutInput> = {}): ForceLayoutInput {
  return {
    count,
    source: Int32Array.from(edges, (e) => e[0]),
    target: Int32Array.from(edges, (e) => e[1]),
    repulsion: 60,
    edgeLength: 40,
    gravity: 0.08,
    friction: 0.2,
    rect: { x: 0, y: 0, width: 1200, height: 600 },
    seed: 1,
    ...over,
  };
}

// two 6-node rings joined by one bridge
const ring = (start: number, n: number): Edge[] => Array.from({ length: n }, (_, i) => [start + i, start + ((i + 1) % n)]);
const EDGES: Edge[] = [...ring(0, 6), ...ring(6, 6), [0, 6]];

const dist = (xy: Float64Array, a: number, b: number) => Math.hypot(xy[2 * a]! - xy[2 * b]!, xy[2 * a + 1]! - xy[2 * b + 1]!);

afterEach(() => vi.restoreAllMocks());

describe("forceLayout", () => {
  it("places every node at a finite point", () => {
    const xy = forceLayout(input(12, EDGES));
    expect(xy).toHaveLength(24);
    expect([...xy].every(Number.isFinite)).toBe(true);
  });

  it("handles an empty graph and a lone node", () => {
    expect(forceLayout(input(0, []))).toHaveLength(0);
    const one = forceLayout(input(1, []));
    expect([...one].every(Number.isFinite)).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const a = forceLayout(input(12, EDGES, { seed: 7 }));
    expect(forceLayout(input(12, EDGES, { seed: 7 }))).toEqual(a);
    expect(forceLayout(input(12, EDGES, { seed: 8 }))).not.toEqual(a);
  });

  it("keeps connected nodes closer than unconnected ones", () => {
    const xy = forceLayout(input(12, EDGES));
    const linked = new Set(EDGES.map(([a, b]) => `${Math.min(a, b)}|${Math.max(a, b)}`));
    let near = 0, nearN = 0, far = 0, farN = 0;
    for (let a = 0; a < 12; a++)
      for (let b = a + 1; b < 12; b++) {
        if (linked.has(`${a}|${b}`)) { near += dist(xy, a, b); nearN++; }
        else { far += dist(xy, a, b); farN++; }
      }
    expect(near / nearN).toBeLessThan((far / farN) * 0.6);
  });

  // the worker must settle the mesh exactly as the in-chart force layout would, given the same start
  it("matches ECharts' own force layout for the same random stream", () => {
    const count = 40;
    const edges: Edge[] = [...ring(0, 20), ...ring(20, 20), [0, 20], [5, 25], [3, 31]];
    const W = 800, H = 500;
    vi.spyOn(Math, "random").mockImplementation(seededRandom(3));
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: W, height: H });
    chart.setOption({
      animation: false,
      series: [{
        type: "graph",
        layout: "force",
        force: { repulsion: 60, edgeLength: [20, 60], gravity: 0.08, friction: 0.2, layoutAnimation: false },
        data: Array.from({ length: count }, (_, i) => ({ id: `n${i}`, name: `n${i}` })),
        links: edges.map(([source, target]) => ({ source, target })),
      }],
    });
    // force mode lays out in the series' view rect: full width, the middle 80% of the height
    const model = (chart as unknown as { getModel(): { getSeriesByIndex(i: number): { getData(): { getItemLayout(i: number): number[] } } } }).getModel();
    const data = model.getSeriesByIndex(0).getData();
    const ours = forceLayout(input(count, edges, { rect: { x: 0, y: 0.1 * H, width: W, height: 0.8 * H }, seed: 3 }));
    for (let i = 0; i < count; i++) {
      const [x, y] = data.getItemLayout(i);
      expect(ours[2 * i]).toBeCloseTo(x!, 6);
      expect(ours[2 * i + 1]).toBeCloseTo(y!, 6);
    }
    chart.dispose();
  });
});
