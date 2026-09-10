import type { EChartsOption } from "./echarts-setup";
import { type ChartColors, tooltipStyle, withAlpha } from "./chartTheme";
import { formatCount } from "../../lib/formatters";
import { airtimePctSeries, busyPct } from "./transforms";
import type { ActivityPoint, TelemetryPoint } from "./types";

const MONO = "JetBrains Mono, monospace";

function timeAxis(c: ChartColors) {
  return {
    type: "time" as const,
    boundaryGap: false,
    axisLine: { lineStyle: { color: c.border } },
    axisLabel: { color: c.textMuted, fontFamily: MONO, fontSize: 10, hideOverlap: true },
    splitLine: { show: false },
  };
}

function valueAxis(c: ChartColors, extra: Record<string, unknown> = {}) {
  return {
    type: "value" as const,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: c.textMuted, fontFamily: MONO, fontSize: 10 },
    splitLine: { lineStyle: { color: c.border, opacity: 0.4 } },
    ...extra,
  };
}

// ---- Mesh ----

export function observationsAreaOption(
  points: { hour: number; observationCount: number; uniquePackets: number }[],
  c: ChartColors,
): EChartsOption {
  const obs = points.map((p) => [p.hour, p.observationCount]);
  const uniq = points.map((p) => [p.hour, p.uniquePackets]);
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 48, right: 14, top: 12, bottom: 24 },
    tooltip: { trigger: "axis", ...tooltipStyle(c), axisPointer: { type: "line", lineStyle: { color: c.primary } } },
    legend: {
      data: ["Observations", "Unique packets"],
      right: 8,
      top: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: c.textNormal, fontFamily: MONO, fontSize: 10 },
      inactiveColor: c.textDim,
    },
    xAxis: timeAxis(c),
    yAxis: valueAxis(c),
    series: [
      {
        name: "Observations",
        type: "line",
        smooth: true,
        symbol: "none",
        data: obs,
        lineStyle: { color: c.primary, width: 2 },
        itemStyle: { color: c.primary },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(c.primary, 0.42) },
              { offset: 1, color: withAlpha(c.primary, 0.01) },
            ],
          },
        },
      },
      {
        name: "Unique packets",
        type: "line",
        smooth: true,
        symbol: "none",
        data: uniq,
        lineStyle: { color: c.secondary, width: 1.3, type: "dashed" },
        itemStyle: { color: c.secondary },
      },
    ],
  };
}

export function leaderboardOption(
  rows: { name: string; value: number; color: string; iata?: string }[],
  c: ChartColors,
  gridLeft = 116, // widen for longer category labels (e.g. radio presets)
): EChartsOption {
  const hasIata = rows.some((r) => Boolean(r.iata)); // reserve room for the end-of-bar chip only when needed
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: gridLeft, right: hasIata ? 96 : 56, top: 6, bottom: 6 },
    tooltip: { trigger: "item", ...tooltipStyle(c) },
    xAxis: { type: "value", axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((r) => r.name),
      axisLine: { show: false },
      axisTick: { show: false },
      // anchor every name at the card's left edge and ellipsize the long ones, instead of letting
      // them run off the left side of the grid
      axisLabel: {
        color: c.textNormal,
        fontFamily: MONO,
        fontSize: 11,
        align: "left",
        margin: gridLeft - 10,
        width: gridLeft - 16,
        overflow: "truncate",
      },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 22,
        barCategoryGap: "42%",
        data: rows.map((r) => ({ value: r.value, iata: r.iata, itemStyle: { color: r.color, borderRadius: [0, 4, 4, 0] } })),
        label: {
          show: true,
          position: "right",
          color: c.textBright,
          fontFamily: MONO,
          fontSize: 11,
          // count, plus an IataChip-style location marker when the row carries one
          formatter: (p: { value: number; data?: { iata?: string } }) => {
            const v = p.value.toLocaleString();
            return p.data?.iata ? `{v|${v}}  {iata|${p.data.iata}}` : v;
          },
          rich: {
            v: { color: c.textBright, fontFamily: MONO, fontSize: 11 },
            iata: {
              color: c.primary,
              backgroundColor: withAlpha(c.primary, 0.1),
              fontFamily: MONO,
              fontWeight: "bold",
              fontSize: 10,
              padding: [2, 4],
              borderRadius: 3,
            },
          },
        },
      },
    ],
  };
}

// Horizontal stacked bars per preset (node + observer segments, total at the bar end).
export function presetBarsOption(
  rows: { name: string; nodes: number; observers: number }[],
  c: ChartColors,
  gridLeft = 172, // fits a full "910.525 · 62.5k · SF7" label
): EChartsOption {
  const totals = rows.map((r) => r.nodes + r.observers);
  const segment = (data: number[], color: string) => ({
    type: "bar" as const,
    stack: "preset",
    barMaxWidth: 22,
    barCategoryGap: "42%",
    data,
    itemStyle: { color },
  });
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: gridLeft, right: 56, top: 22, bottom: 6 },
    tooltip: { trigger: "axis", ...tooltipStyle(c), axisPointer: { type: "shadow" } },
    legend: {
      data: ["Nodes", "Observers"],
      right: 8,
      top: 0,
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: c.textNormal, fontFamily: MONO, fontSize: 10 },
      inactiveColor: c.textDim,
    },
    xAxis: { type: "value", axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((r) => r.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: c.textNormal,
        fontFamily: MONO,
        fontSize: 11,
        align: "left",
        margin: gridLeft - 10,
        width: gridLeft - 16,
        overflow: "truncate",
      },
    },
    series: [
      { name: "Nodes", ...segment(rows.map((r) => r.nodes), c.primary) },
      {
        name: "Observers",
        ...segment(rows.map((r) => r.observers), c.secondary),
        // outer segment carries the row total so it sits at the end of the whole stack
        label: {
          show: true,
          position: "right" as const,
          color: c.textBright,
          fontFamily: MONO,
          fontSize: 11,
          formatter: (p: { dataIndex: number }) => totals[p.dataIndex]!.toLocaleString(),
        },
      },
    ],
  };
}

// Donut for small category sets; the center total rides on the first slice's label, which ECharts pins to the ring center.
export function donutOption(
  items: { name: string; value: number; color?: string }[],
  c: ChartColors,
  centerValue: string,
  centerLabel: string,
): EChartsOption {
  const centerText = {
    show: true,
    position: "center" as const,
    formatter: `{v|${centerValue}}\n{l|${centerLabel}}`,
    rich: {
      v: { color: c.textBright, fontFamily: MONO, fontSize: 21, fontWeight: 700 as const, lineHeight: 24 },
      l: { color: c.textMuted, fontFamily: MONO, fontSize: 9, lineHeight: 12 },
    },
  };
  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: { trigger: "item", ...tooltipStyle(c), formatter: "{b}: {c} ({d}%)" },
    legend: {
      orient: "horizontal",
      left: "center",
      bottom: 4,
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 10,
      textStyle: { color: c.textNormal, fontFamily: MONO, fontSize: 10 },
      inactiveColor: c.textDim,
    },
    series: [
      {
        type: "pie",
        radius: ["48%", "70%"],
        center: ["50%", "46%"],
        avoidLabelOverlap: false,
        itemStyle: { borderColor: c.bgSurface, borderWidth: 2, borderRadius: 4 },
        label: { show: false },
        emphasis: { scaleSize: 5 },
        data: items.map((it, i) => ({
          name: it.name,
          value: it.value,
          itemStyle: { color: it.color ?? c.series[i % c.series.length] },
          // the center total rides on the first slice only; per-slice labels stay hidden
          ...(i === 0 ? { label: centerText, emphasis: { label: centerText } } : {}),
        })),
      },
    ],
  };
}

// Vertical bars for the payload-type breakdown. Replaced the old donut: with 10+ slivers the legend
// needed scrolling, names truncated, and thin slices couldn't be compared by eye — bars label every
// category inline and need no legend at all.
export function typeBarOption(
  items: { name: string; value: number; color?: string }[],
  c: ChartColors,
): EChartsOption {
  const crowded = items.length > 5;
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 44, right: 10, top: 18, bottom: crowded ? 52 : 24 },
    tooltip: { trigger: "item", ...tooltipStyle(c), formatter: "{b}: {c}" },
    xAxis: {
      type: "category",
      data: items.map((it) => it.name),
      axisLine: { lineStyle: { color: c.border } },
      axisTick: { show: false },
      // slant only when there are enough categories for labels to collide
      axisLabel: { color: c.textNormal, fontFamily: MONO, fontSize: 9, interval: 0, rotate: crowded ? 36 : 0, width: 92, overflow: "truncate" },
    },
    yAxis: valueAxis(c),
    series: [
      {
        type: "bar",
        barMaxWidth: 28,
        data: items.map((it, i) => ({ value: it.value, itemStyle: { color: it.color ?? c.series[i % c.series.length], borderRadius: [4, 4, 0, 0] } })),
        label: {
          show: true,
          position: "top",
          color: c.textBright,
          fontFamily: MONO,
          fontSize: 9,
          formatter: (p: { value: number }) => formatCount(p.value),
        },
      },
    ],
  };
}

// ---- Observer telemetry ----
// `t` arrives in epoch ms.

function percentAxis(c: ChartColors) {
  return valueAxis(c, { axisLabel: { color: c.textMuted, fontFamily: MONO, fontSize: 10, formatter: "{value}%" } });
}

const pctLabel = (v: unknown) => (typeof v === "number" ? `${v}%` : "—");

export function airtimeOption(points: TelemetryPoint[], c: ChartColors, bucketMs: number | null): EChartsOption {
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 48, right: 14, top: 24, bottom: 22 },
    legend: { data: ["RX", "TX"], right: 6, top: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: c.textNormal, fontFamily: MONO, fontSize: 10 } },
    tooltip: { trigger: "axis", ...tooltipStyle(c), valueFormatter: pctLabel },
    xAxis: timeAxis(c),
    yAxis: percentAxis(c),
    series: [
      { name: "RX", type: "line", stack: "air", smooth: true, symbol: "none", connectNulls: true, data: airtimePctSeries(points, "airtimeRxPct", bucketMs), lineStyle: { width: 1, color: c.green }, areaStyle: { color: withAlpha(c.green, 0.35) }, itemStyle: { color: c.green } },
      { name: "TX", type: "line", stack: "air", smooth: true, symbol: "none", connectNulls: true, data: airtimePctSeries(points, "airtimeTxPct", bucketMs), lineStyle: { width: 1, color: c.primary }, areaStyle: { color: withAlpha(c.primary, 0.35) }, itemStyle: { color: c.primary } },
    ],
  };
}

// Single-metric line chart (small multiple). `delta` charts the per-report increase of a cumulative
// counter; `area` adds a fill (use only for counters that sit near zero, not offset ranges like dBm/V).
function seriesData(points: TelemetryPoint[], accessor: (p: TelemetryPoint) => number | null, delta: boolean) {
  if (!delta) return points.map((p) => [p.t, accessor(p)]);
  const out: [number, number | null][] = [];
  for (let i = 1; i < points.length; i++) {
    const a = accessor(points[i - 1]!);
    const b = accessor(points[i]!);
    out.push([points[i]!.t, a != null && b != null ? Math.max(0, b - a) : null]);
  }
  return out;
}

function metricLineOption(
  points: TelemetryPoint[],
  c: ChartColors,
  o: { name: string; color: string; accessor: (p: TelemetryPoint) => number | null; delta?: boolean; area?: boolean },
): EChartsOption {
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 50, right: 14, top: 14, bottom: 22 },
    tooltip: { trigger: "axis", ...tooltipStyle(c) },
    xAxis: timeAxis(c),
    yAxis: valueAxis(c, { scale: true }),
    series: [
      {
        name: o.name,
        type: "line",
        smooth: true,
        symbol: "none",
        connectNulls: true,
        data: seriesData(points, o.accessor, o.delta ?? false),
        lineStyle: { color: o.color, width: 1.8 },
        itemStyle: { color: o.color },
        ...(o.area ? { areaStyle: { color: withAlpha(o.color, 0.16) } } : {}),
      },
    ],
  };
}

export const batteryOption = (p: TelemetryPoint[], c: ChartColors) =>
  metricLineOption(p, c, { name: "Battery V", color: c.primary, accessor: (x) => (x.batteryMv == null ? null : +(x.batteryMv / 1000).toFixed(3)) });

export const noiseFloorOption = (p: TelemetryPoint[], c: ChartColors) =>
  metricLineOption(p, c, { name: "Noise dBm", color: c.warn, accessor: (x) => x.noiseFloorDb });

export const queueOption = (p: TelemetryPoint[], c: ChartColors) =>
  metricLineOption(p, c, { name: "Queue", color: c.secondary, accessor: (x) => x.queueLength, area: true });

// receiveErrors is a cumulative counter in raw points, a per-bucket delta in bucketed ones
export const receiveErrorsOption = (p: TelemetryPoint[], c: ChartColors, bucketed: boolean) =>
  metricLineOption(p, c, { name: "Recv errors", color: c.danger, accessor: (x) => x.receiveErrors, delta: !bucketed, area: true });

// ---- Observer activity (what it heard) ----

export interface TimeWindow {
  start: number; // epoch ms
  end: number;
}

// Pin the axis to the selected range so a quiet observer shows empty space up to now.
function windowAxis(c: ChartColors, w: TimeWindow) {
  return { ...timeAxis(c), min: w.start, max: w.end };
}

// The bucket still in progress is measured against the time elapsed so far, not the full width.
function busySpanMs(t: number, intervalMs: number, w: TimeWindow): number {
  return t < w.end && t + intervalMs > w.end ? w.end - t : intervalMs;
}

export function busyOption(points: ActivityPoint[], c: ChartColors, intervalMs: number | null, w: TimeWindow): EChartsOption {
  const pct = (p: ActivityPoint) => (intervalMs == null ? null : busyPct(p.airtimeMs, busySpanMs(p.t, intervalMs, w)));
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 48, right: 14, top: 14, bottom: 22 },
    tooltip: { trigger: "axis", ...tooltipStyle(c), valueFormatter: pctLabel },
    xAxis: windowAxis(c, w),
    yAxis: percentAxis(c),
    series: [
      {
        name: "Busy",
        type: "line",
        symbol: "none",
        connectNulls: false,
        data: points.map((p) => [p.t, pct(p)]),
        lineStyle: { width: 1.5, color: c.green },
        areaStyle: { color: withAlpha(c.green, 0.28) },
        itemStyle: { color: c.green },
      },
    ],
  };
}

export function heardOption(points: ActivityPoint[], c: ChartColors, w: TimeWindow): EChartsOption {
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 48, right: 14, top: 14, bottom: 22 },
    tooltip: { trigger: "axis", ...tooltipStyle(c) },
    xAxis: windowAxis(c, w),
    yAxis: valueAxis(c, { minInterval: 1 }),
    series: [
      {
        name: "Heard",
        type: "line",
        symbol: "none",
        data: points.map((p) => [p.t, p.observations]),
        lineStyle: { width: 1.5, color: c.primary },
        areaStyle: { color: withAlpha(c.primary, 0.28) },
        itemStyle: { color: c.primary },
      },
    ],
  };
}

const dbLabel = (v: unknown) => (typeof v === "number" ? `${v} dB` : "—");

export function snrHeardOption(points: ActivityPoint[], c: ChartColors, w: TimeWindow): EChartsOption {
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 54, right: 14, top: 24, bottom: 22 },
    legend: { data: ["Avg", "Min"], right: 6, top: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: c.textNormal, fontFamily: MONO, fontSize: 10 } },
    tooltip: { trigger: "axis", ...tooltipStyle(c), valueFormatter: dbLabel },
    xAxis: windowAxis(c, w),
    yAxis: valueAxis(c, { scale: true, axisLabel: { color: c.textMuted, fontFamily: MONO, fontSize: 10, formatter: "{value} dB" } }),
    series: [
      { name: "Avg", type: "line", symbol: "none", connectNulls: false, data: points.map((p) => [p.t, p.snrAvg]), lineStyle: { width: 1.8, color: c.secondary }, itemStyle: { color: c.secondary } },
      { name: "Min", type: "line", symbol: "none", connectNulls: false, data: points.map((p) => [p.t, p.snrMin]), lineStyle: { width: 1, color: c.textMuted, type: "dashed" }, itemStyle: { color: c.textMuted } },
    ],
  };
}
