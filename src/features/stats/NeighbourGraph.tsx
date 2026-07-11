import { useCallback, useEffect, useMemo, useRef } from "react";
import { EChart } from "./EChart";
import type { EChartsInstance } from "./echarts-setup";
import {
  neighbourGraphOption,
  obsColor,
  ageOpacity,
  type NeighbourGraph as NeighbourGraphData,
  type NeighbourWeight,
} from "./neighbour-graph";
import type { ChartColors } from "./chartTheme";

interface Props {
  graph: NeighbourGraphData;
  colors: ChartColors;
  selectedId: string | null;
  focusWeights: Record<string, NeighbourWeight> | null;
  onSelect: (id: string | null) => void;
}

// Presentational force graph. The structural option is memoized on [graph, colors] only, so it (and
// the force layout) rebuilds only for a genuinely new mesh or theme. Selection styling is applied
// imperatively — a link-only merge plus dispatchAction — so it never disturbs settled node positions.
export function NeighbourGraph({ graph, colors, selectedId, focusWeights, onSelect }: Props) {
  const chartRef = useRef<EChartsInstance | null>(null);
  const option = useMemo(() => neighbourGraphOption(graph, colors), [graph, colors]);

  const onInit = useCallback(
    (chart: EChartsInstance) => {
      chartRef.current = chart;
      // clicking empty canvas clears the selection
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

  // Selection styling in one pass: recolour the selected node's edges by obs/freshness (link-only
  // merge, so node positions survive), then spotlight its adjacency and dim the rest. `option` is a
  // dep so both re-apply after a theme/mesh rebuild replaces the chart state.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return; // a prior instance may linger across a dev remount

    const links =
      selectedId && focusWeights
        ? graph.links.map((l) => {
            const a = graph.nodes[l.source]!.id;
            const b = graph.nodes[l.target]!.id;
            const otherId = a === selectedId ? b : b === selectedId ? a : null;
            const w = otherId ? focusWeights[otherId] : undefined;
            if (!w) return l;
            return {
              ...l,
              obs: w.obs,
              ageDays: w.ageDays,
              lineStyle: { color: obsColor(w.obs, colors), opacity: ageOpacity(w.ageDays), width: 1.8 },
            };
          })
        : graph.links;
    chart.setOption({ series: [{ links }] }, { notMerge: false, lazyUpdate: true });

    chart.dispatchAction({ type: "downplay", seriesIndex: 0 });
    if (selectedId) {
      const idx = graph.nodes.findIndex((n) => n.id === selectedId);
      if (idx >= 0) chart.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: idx });
    }
  }, [selectedId, focusWeights, graph, option, colors]);

  return <EChart option={option} onEvents={onEvents} onInit={onInit} className="h-full w-full" />;
}
