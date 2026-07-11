import { useCallback, useMemo } from "react";
import { EChart } from "./EChart";
import type { EChartsInstance, EChartsOption } from "./echarts-setup";

interface Props {
  option: EChartsOption;
  onSelect: (id: string | null) => void;
}

// Presentational force graph. The caller swaps the whole option between the full mesh and a node's ego
// view, so this stays dumb: render the option, report node clicks, and treat a bare-canvas click as
// "back to the full mesh". No emphasis/dispatch, so dragging a node never flickers.
export function NeighbourGraph({ option, onSelect }: Props) {
  const onInit = useCallback(
    (chart: EChartsInstance) => {
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

  return <EChart option={option} onEvents={onEvents} onInit={onInit} className="h-full w-full" />;
}
