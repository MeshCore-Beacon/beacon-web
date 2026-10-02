import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { echarts, type EChartsInstance, type EChartsOption } from "./echarts-setup";

interface EChartProps {
  option: EChartsOption;
  className?: string;
  style?: React.CSSProperties;
  // Map of ECharts event name -> handler (e.g. { click: (p) => ... }). Kept stable by the caller.
  onEvents?: Record<string, (params: unknown) => void>;
  // Called once with the instance after init, for callers that need imperative control (e.g. the
  // neighbour graph dispatches highlight/downplay so selection never re-runs the force layout).
  onInit?: (chart: EChartsInstance) => void;
}

// Thin React wrapper over the core ECharts API: init once, resize via ResizeObserver, dispose on
// unmount, and re-apply the (memoized) option with notMerge so theme/data swaps fully replace state.
// Hand-rolled on purpose — we avoid the echarts-for-react dependency.
export function EChart({ option, className, style, onEvents, onInit }: EChartProps) {
  const { i18n } = useTranslation();
  // ECharts fixes its locale at init, so a language switch rebuilds the instance
  const locale = i18n.resolvedLanguage === "fr" ? "FR" : "EN";
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsInstance | null>(null);
  const onInitRef = useRef(onInit);
  useEffect(() => {
    onInitRef.current = onInit;
  }, [onInit]);

  useEffect(() => {
    if (!elRef.current) return;
    const chart = echarts.init(elRef.current, null, { renderer: "canvas", locale });
    chartRef.current = chart;
    onInitRef.current?.(chart);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [locale]);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option, locale]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onEvents) return;
    const entries = Object.entries(onEvents);
    for (const [ev, handler] of entries) chart.on(ev, handler);
    return () => {
      if (chart.isDisposed()) return;
      for (const [ev, handler] of entries) chart.off(ev, handler);
    };
  }, [onEvents, locale]);

  return <div ref={elRef} className={className} style={{ width: "100%", height: "100%", ...style }} />;
}
