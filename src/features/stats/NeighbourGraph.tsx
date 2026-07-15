import { useCallback, useEffect, useMemo, useRef } from "react";
import { EChart } from "./EChart";
import type { EChartsInstance, EChartsOption } from "./echarts-setup";
import { nodeNameMatches, type GraphNode } from "./neighbour-graph";

interface Props {
  option: EChartsOption;
  nodes: GraphNode[];
  search: string;
  onSelect: (id: string | null) => void;
}

// Presentational force graph. The caller swaps the whole option between the full mesh and a node's ego
// view; this stays dumb apart from the search overlay. No emphasis/dispatch, so dragging never flickers.
export function NeighbourGraph({ option, nodes, search, onSelect }: Props) {
  const chartRef = useRef<EChartsInstance | null>(null);

  const onInit = useCallback(
    (chart: EChartsInstance) => {
      chartRef.current = chart;
      // clicking empty canvas returns to the full mesh
      chart.getZr().on("click", (e: { target?: unknown }) => {
        if (!e.target) onSelect(null);
      });
    },
    [onSelect],
  );

  const onEvents = useMemo(
    () => ({
      click: (p: unknown) => {
        const param = p as { dataType?: string; data?: { id?: string } };
        if (param.dataType === "edge") return;
        const id = param.data?.id;
        if (id) onSelect(id);
      },
    }),
    [onSelect],
  );

  // Search: highlight matches, dim the rest — a per-node itemStyle/label merge only. The layout is at
  // equilibrium, so a style-only merge (no x/y change) leaves node positions put — no relayout, no
  // flicker. `option` is a dep so styling re-applies after a region/ego swap replaces the chart state.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const q = search.trim();
    const data = nodes.map((n) => {
      if (!q) return { ...n, itemStyle: { opacity: 1 }, label: n.label ?? { show: false } };
      const match = nodeNameMatches(n.name, q);
      return {
        ...n,
        itemStyle: { opacity: match ? 1 : 0.06 },
        label: match ? { show: true, fontSize: 13 } : { show: false },
      };
    });
    chart.setOption({ series: [{ data }] }, { notMerge: false });
  }, [search, nodes, option]);

  return <EChart option={option} onEvents={onEvents} onInit={onInit} className="h-full w-full" />;
}
