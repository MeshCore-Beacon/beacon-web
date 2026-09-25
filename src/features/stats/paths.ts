import type { TFunction } from "i18next";
import type { EChartsOption } from "echarts";
import type { PathLengthBin, PathStats } from "./types";
import { blend, tooltipStyle, withAlpha, type ChartColors } from "./chartTheme";

const HOUR = 3_600_000;
export function pathHours(data: PathStats | undefined) {
  if (!data || data.until <= data.since) return [];
  const first = Math.floor(data.since / HOUR) * HOUR;
  const rows = new Map(data.hourly.map((row) => [row.hour, row]));
  return Array.from({ length: Math.min(721, Math.ceil((data.until - first) / HOUR)) }, (_, i) => {
    const hour = first + i * HOUR, row = rows.get(hour);
    return { hour, oneByte: row?.oneByte ?? null, twoByte: row?.twoByte ?? null, threeByte: row?.threeByte ?? null };
  });
}

export function pathLengthOption(bins: PathLengthBin[], c: ChartColors, t: TFunction): EChartsOption {
  const max = Math.min(63, Math.max(0, ...bins.map((bin) => bin.entries)));
  const counts = new Map(bins.map((bin) => [bin.entries, bin.receptions]));
  const entries = Array.from({ length: max + 1 }, (_, i) => i);
  return {
    animation: false,
    aria: { enabled: true, label: { description: t("paths.lengthDescription") } },
    grid: { left: 8, right: 12, top: 18, bottom: 38, containLabel: true },
    tooltip: { trigger: "axis", renderMode: "richText", ...tooltipStyle(c) },
    xAxis: { type: "category", data: entries, name: t("paths.entries"), nameLocation: "middle", nameGap: 25, nameTextStyle: { color: c.textMuted }, axisLabel: { color: c.textMuted, fontSize: 10 }, axisLine: { lineStyle: { color: c.border } } },
    yAxis: { type: "value", minInterval: 1, axisLabel: { color: c.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: c.borderSubtle } } },
    series: [{ name: t("paths.receptionsColumn"), type: "bar", barMaxWidth: 26, data: entries.map((i) => ({ value: counts.get(i) ?? 0, itemStyle: { color: i === 0 ? c.textDim : blend(c.primary, c.secondary, i / Math.max(1, max)), borderRadius: [3, 3, 0, 0] } })) }],
  };
}

export function pathTrendOption(hours: ReturnType<typeof pathHours>, c: ChartColors, t: TFunction): EChartsOption {
  return {
    animation: false, useUTC: true,
    aria: { enabled: true, label: { description: t("paths.trendDescription") } },
    legend: { top: 0, textStyle: { color: c.textNormal, fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
    grid: { left: 8, right: 18, top: 35, bottom: 15, containLabel: true },
    tooltip: { trigger: "axis", renderMode: "richText", ...tooltipStyle(c) },
    xAxis: { type: "time", axisLabel: { color: c.textMuted, fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: c.border } } },
    yAxis: { type: "value", minInterval: 1, axisLabel: { color: c.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: c.borderSubtle } } },
    series: (["oneByte", "twoByte", "threeByte"] as const).map((field, i) => ({
      name: t("paths.hashWidth", { count: i + 1 }), type: "line", stack: "hash-paths", connectNulls: false, showSymbol: true, symbolSize: 4,
      lineStyle: { width: 1.5, color: c.series[i] }, itemStyle: { color: c.series[i] }, areaStyle: { color: withAlpha(c.series[i]!, 0.32) },
      data: hours.map((hour) => [hour.hour, hour[field]]),
    })),
  };
}
