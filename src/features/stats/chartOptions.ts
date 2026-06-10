import type { EChartsOption } from "./echarts-setup";
import { type ChartColors, tooltipStyle, withAlpha } from "./chartTheme";
import { formatCount } from "../../lib/formatters";
import type { TelemetryPoint } from "./types";

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
  rows: { name: string; value: number; color: string }[],
  c: ChartColors,
  gridLeft = 116, // widen for longer category labels (e.g. radio presets)
): EChartsOption {
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: gridLeft, right: 56, top: 6, bottom: 6 },
    tooltip: { trigger: "item", ...tooltipStyle(c) },
    xAxis: { type: "value", axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((r) => r.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: c.textNormal, fontFamily: MONO, fontSize: 11 },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: 22,
        barCategoryGap: "42%",
        data: rows.map((r) => ({ value: r.value, itemStyle: { color: r.color, borderRadius: [0, 4, 4, 0] } })),
        label: {
          show: true,
          position: "right",
          color: c.textBright,
          fontFamily: MONO,
          fontSize: 11,
          formatter: (p: { value: number }) => p.value.toLocaleString(),
        },
      },
    ],
  };
}

// Vertical bars for the type breakdowns (payload types, node types). Replaced the old donuts: with
// 10+ slivers the legend needed scrolling, names truncated, and the center total clipped at narrow
// widths — bars label every category inline and need no legend at all.
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
// `t` arrives in epoch ms (normalized in useObserverTelemetry).

// airtimeTx/RxPct are cumulative counters, so chart the per-report delta (airtime used per interval),
// clamped at 0 to ignore counter resets. Caveat: under bucketing (7d/30d) the backend AVGs these
// counters, so the delta is approximate — pending a backend MAX−MIN fix (beacon-docs ticket).
function deltaSeries(points: TelemetryPoint[], key: "airtimeRxPct" | "airtimeTxPct") {
  const out: [number, number | null][] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]![key];
    const cur = points[i]![key];
    const d = prev != null && cur != null ? Math.max(0, cur - prev) : null;
    out.push([points[i]!.t, d]);
  }
  return out;
}

export function airtimeOption(points: TelemetryPoint[], c: ChartColors): EChartsOption {
  return {
    animation: false,
    backgroundColor: "transparent",
    grid: { left: 44, right: 14, top: 24, bottom: 22 },
    legend: { data: ["RX", "TX"], right: 6, top: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: c.textNormal, fontFamily: MONO, fontSize: 10 } },
    tooltip: { trigger: "axis", ...tooltipStyle(c) },
    xAxis: timeAxis(c),
    yAxis: valueAxis(c),
    series: [
      { name: "RX", type: "line", stack: "air", smooth: true, symbol: "none", connectNulls: true, data: deltaSeries(points, "airtimeRxPct"), lineStyle: { width: 1, color: c.green }, areaStyle: { color: withAlpha(c.green, 0.35) }, itemStyle: { color: c.green } },
      { name: "TX", type: "line", stack: "air", smooth: true, symbol: "none", connectNulls: true, data: deltaSeries(points, "airtimeTxPct"), lineStyle: { width: 1, color: c.primary }, areaStyle: { color: withAlpha(c.primary, 0.35) }, itemStyle: { color: c.primary } },
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

export const receiveErrorsOption = (p: TelemetryPoint[], c: ChartColors) =>
  metricLineOption(p, c, { name: "Recv errors / report", color: c.danger, accessor: (x) => x.receiveErrors, delta: true, area: true });
