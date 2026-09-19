import type { EChartsOption } from "./echarts-setup";
import { tooltipStyle, type ChartColors } from "./chartTheme";
import { RANGE_MS, type ObservationPoint, type StatsRange } from "./types";

const HOUR = 3_600_000;
const MONO = "JetBrains Mono, monospace";

export function trafficModel(points: ObservationPoint[], range: StatsRange, asOf: number) {
  const end = Math.floor(asOf / HOUR) * HOUR;
  const length = RANGE_MS[range] / HOUR;
  const start = end - (length - 1) * HOUR;
  const buckets = new Map<number, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const point of points) {
    if (!Number.isFinite(point.hour) || point.hour < start || point.hour > end || !Number.isFinite(point.observationCount) || point.observationCount < 0) continue;
    const hour = Math.floor(point.hour / HOUR) * HOUR;
    const name = point.iata.trim().toUpperCase() || "Unassigned";
    const bucket = buckets.get(hour) ?? new Map<string, number>();
    bucket.set(name, (bucket.get(name) ?? 0) + point.observationCount);
    buckets.set(hour, bucket);
    totals.set(name, (totals.get(name) ?? 0) + point.observationCount);
  }
  const areas = [...totals].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const names = areas.slice(0, 7).map((area) => area.name);
  const hours = Array.from({ length }, (_, i) => {
    const hour = start + i * HOUR;
    const bucket = buckets.get(hour);
    return { hour, total: bucket ? [...bucket.values()].reduce((a, b) => a + b, 0) : null };
  });
  const series = names.map((name) => ({
    name, total: totals.get(name) ?? 0,
    values: hours.map(({ hour }) => buckets.has(hour) ? (buckets.get(hour)?.get(name) ?? 0) : null),
  }));
  if (areas.length > names.length) {
    series.push({ name: "Other IATAs", total: areas.slice(7).reduce((sum, area) => sum + area.total, 0),
      values: hours.map(({ hour, total }) => total === null ? null : total - names.reduce((sum, name) => sum + (buckets.get(hour)?.get(name) ?? 0), 0)) });
  }
  const days = [...new Set(hours.map(({ hour }) => new Date(hour).toISOString().slice(0, 10)))];
  const heatmap: number[][] = [];
  let peak: { hour: number; total: number } | null = null;
  for (const { hour, total } of hours) {
    if (total === null) continue;
    heatmap.push([new Date(hour).getUTCHours(), days.indexOf(new Date(hour).toISOString().slice(0, 10)), total]);
    if (!peak || total > peak.total) peak = { hour, total };
  }
  return { hours, days, heatmap, peak, areas, series, reportedHours: buckets.size, total: areas.reduce((sum, area) => sum + area.total, 0) };
}

export type TrafficModel = ReturnType<typeof trafficModel>;

export function trafficTrendOption(model: TrafficModel, c: ChartColors): EChartsOption {
  const present = model.hours.filter((hour) => hour.total !== null);
  const first = present[0]?.hour;
  const last = present.at(-1)?.hour;
  return {
    animation: false, useUTC: true, backgroundColor: "transparent",
    aria: { enabled: true, label: { description: "Hourly reported receptions by IATA. Gaps mean no retained hourly record. Exact totals follow in the data table." } },
    grid: { left: 54, right: 18, top: 42, bottom: 28 },
    tooltip: { trigger: "axis", renderMode: "richText", ...tooltipStyle(c) },
    legend: { type: "scroll", top: 0, left: 0, right: 0, textStyle: { color: c.textNormal, fontSize: 10 }, inactiveColor: c.textDim },
    xAxis: { type: "time", min: first === last && first !== undefined ? first - HOUR / 2 : first, max: first === last && last !== undefined ? last + HOUR / 2 : last,
      axisLabel: { color: c.textMuted, fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: c.border } }, splitLine: { show: false } },
    yAxis: { type: "value", minInterval: 1, axisLabel: { color: c.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: c.border, opacity: 0.4 } } },
    series: model.series.map((series, index) => ({
      name: series.name, type: "line", stack: "receptions", connectNulls: false, smooth: false,
      symbol: "circle", symbolSize: 5, showSymbol: present.length <= 2,
      data: model.hours.map((hour, i) => [hour.hour, series.values[i]]),
      lineStyle: { color: c.series[index], width: 1.5 }, itemStyle: { color: c.series[index] }, areaStyle: { color: c.series[index], opacity: 0.45 },
    })),
  };
}

export function trafficHeatmapOption(model: TrafficModel, c: ChartColors): EChartsOption {
  return {
    animation: false, backgroundColor: "transparent",
    aria: { enabled: true, label: { description: "Activity heatmap by UTC day and hour. Brighter cells indicate more reported receptions; blank cells have no retained record." } },
    grid: { left: 58, right: 14, top: 8, bottom: 62 },
    tooltip: { trigger: "item", renderMode: "richText", ...tooltipStyle(c), formatter: (item: { value: unknown }) => {
      const value = item.value as [number, number, number];
      return `${model.days[value[1]]} ${String(value[0]).padStart(2, "0")}:00 UTC\n${value[2].toLocaleString()} receptions`;
    } },
    xAxis: { type: "category", data: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")),
      axisLabel: { color: c.textMuted, fontSize: 9, interval: 2 }, axisTick: { show: false }, axisLine: { show: false }, splitArea: { show: true, areaStyle: { color: [c.bgRaised, c.bgSurface] } } },
    yAxis: { type: "category", data: model.days, inverse: true, axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: c.textMuted, fontFamily: MONO, fontSize: 9, formatter: (day: string) => day.slice(5) } },
    visualMap: { min: 0, max: Math.max(1, model.peak?.total ?? 0), calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 130,
      text: ["More", "Fewer"], textStyle: { color: c.textMuted, fontSize: 10 }, inRange: { color: [c.primaryDim, c.primary, c.secondary, c.green, c.warn] } },
    series: [{ name: "Receptions", type: "heatmap", data: model.heatmap, itemStyle: { borderColor: c.bgSurface, borderWidth: 1 }, emphasis: { itemStyle: { borderColor: c.textBright, borderWidth: 1 } } }],
  };
}
