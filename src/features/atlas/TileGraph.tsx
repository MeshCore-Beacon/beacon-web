import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { ModalOverlay } from "../../components/ModalOverlay";
import { useChartColors } from "../stats/chartTheme";
import { EChart } from "../stats/EChart";
import type { EChartsInstance } from "../stats/echarts-setup";
import type { AtlasRange } from "./atlas";
import { tileGraphOption, type GraphPoint, type TileMetric } from "./tile-graph";

interface TileGraphProps {
  name: string; // the pinned radio
  metric: string;
  range: AtlasRange;
  color: string;
  points: GraphPoint[];
  spec: TileMetric;
  missing: string; // what the tooltip shows for an hour with no value
  onClose: () => void;
}

// One tile's series drawn large. It reads what the card already loaded, so it follows the card's refresh.
export function TileGraph({ name, metric, range, color, points, spec, missing, onClose }: TileGraphProps) {
  const { t } = useTranslation();
  const c = useChartColors();
  const option = useMemo(() => tileGraphOption(points, c, { ...spec, name: metric, color, missing }), [points, c, spec, metric, color, missing]);

  const chart = useRef<EChartsInstance | null>(null);
  const zoom = useRef<{ start: number; end: number } | null>(null);
  const onInit = useCallback((instance: EChartsInstance) => { chart.current = instance; }, []);
  const onEvents = useMemo(() => ({
    datazoom: (params: unknown) => {
      const event = params as { start?: number; end?: number; batch?: { start?: number; end?: number }[] };
      const { start, end } = event.batch?.[0] ?? event;
      if (typeof start === "number" && typeof end === "number") zoom.current = { start, end };
    },
  }), []);
  // Each refresh replaces the whole option, so the zoom the user set is put back.
  useEffect(() => {
    if (zoom.current) chart.current?.dispatchAction({ type: "dataZoom", ...zoom.current });
  }, [option]);

  const title = t("atlas.graph.title", { name, metric });
  const empty = !points.some(([, v]) => v !== null);
  return createPortal(
    <div className="fixed inset-0 z-50">
      <ModalOverlay centered label={title} onClose={onClose}>
        <div className="flex max-h-full w-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-bg-surface p-4">
          <header className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="truncate font-mono text-base font-semibold text-text-bright">{title}</h2>
              <p className="font-mono text-xs text-text-muted">{t("atlas.graph.window", { range: t(`atlas.ranges.${range}`) })}</p>
            </div>
            <button type="button" className={ACTION_BUTTON_CLASS} onClick={onClose}>{t("common.close")}</button>
          </header>
          <div className="h-[min(60vh,26rem)] min-h-0">
            {empty
              ? <p className="flex h-full items-center justify-center font-mono text-[11px] text-text-dim">{t("common.noData")}</p>
              : <EChart option={option} onEvents={onEvents} onInit={onInit} />}
          </div>
        </div>
      </ModalOverlay>
    </div>,
    document.body,
  );
}
