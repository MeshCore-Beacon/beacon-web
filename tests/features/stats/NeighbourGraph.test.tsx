import { beforeEach, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NeighbourGraph } from "../../../src/features/stats/NeighbourGraph";
import type { GraphNode } from "../../../src/features/stats/neighbour-graph";
import type { EChartsOption } from "../../../src/features/stats/echarts-setup";

const chart = vi.hoisted(() => ({ setOption: vi.fn(), isDisposed: () => false, getZr: () => ({ on: vi.fn() }) }));
vi.mock("../../../src/features/stats/EChart", () => ({
  EChart: ({ onInit }: { onInit?: (c: unknown) => void }) => {
    onInit?.(chart);
    return null;
  },
}));

const nodes: GraphNode[] = [
  { id: "a", name: "Alpha", category: 0, nodeTypeName: "repeater", degree: 1, symbolSize: 10, x: 1, y: 2 },
  { id: "b", name: "Bravo", category: 0, nodeTypeName: "repeater", degree: 1, symbolSize: 10, x: 3, y: 4 },
];
const optionA: EChartsOption = { series: [] };
const optionB: EChartsOption = { series: [] };
const view = (option: EChartsOption, search: string) => <NeighbourGraph option={option} nodes={nodes} search={search} onSelect={() => {}} />;

beforeEach(() => chart.setOption.mockClear());

it("leaves a fresh graph alone while the search is empty", () => {
  const r = render(view(optionA, ""));
  r.rerender(view(optionB, ""));
  expect(chart.setOption).not.toHaveBeenCalled();
});

it("dims non-matches on search, keeping positions, and restores them when cleared", () => {
  const r = render(view(optionA, "alp"));
  const dimmed = chart.setOption.mock.calls[0]![0].series[0].data;
  expect(dimmed[0]).toMatchObject({ id: "a", x: 1, y: 2, itemStyle: { opacity: 1 }, label: { show: true } });
  expect(dimmed[1]).toMatchObject({ id: "b", x: 3, y: 4, itemStyle: { opacity: 0.06 }, label: { show: false } });

  r.rerender(view(optionA, ""));
  const restored = chart.setOption.mock.calls[1]![0].series[0].data;
  expect(restored[1]).toMatchObject({ id: "b", itemStyle: { opacity: 1 }, label: { show: false } });
});
