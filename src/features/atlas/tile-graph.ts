import { formatBattery, formatCount, formatUptime } from "../../lib/formatters";
import { formatTemp, type TemperatureUnit } from "../../lib/units";
import { timeAxis, valueAxis } from "../stats/chartOptions";
import { tooltipStyle, withAlpha, type ChartColors } from "../stats/chartTheme";
import type { EChartsOption } from "../stats/echarts-setup";
import { average } from "../stats/signal";
import { hourSlots, type AtlasRange, type ObserverTile, type TelemetryTile } from "./atlas";

// How a tile writes its value. The tile and its full graph read the same entry.
export interface TileMetric {
  format: (v: number) => string;
  unit?: string; // names the y axis
  axis?: (v: number) => string; // y axis labels, when a bare number would not read
  zero?: boolean; // the y axis starts at zero
}

const rounded = (v: number) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
export const percent = (v: number) => `${rounded(v)}%`;
// Two units at most so a long uptime fits the tile; the title has the full value.
export const shortUptime = (seconds: number) => formatUptime(seconds).split(" ").slice(0, 2).join(" ");
export const perHour = (v: number) => `${rounded(v)}/h`;

const count: TileMetric = { format: formatCount, zero: true };
const snr: TileMetric = { format: (v) => average(v, "dB"), unit: "dB" };
const rssi: TileMetric = { format: (v) => average(v, "dBm"), unit: "dBm" };
const noise: TileMetric = { format: (v) => `${Math.round(v)} dBm`, unit: "dBm" };
const battery: TileMetric = { format: formatBattery, unit: "V" };
const uptime: TileMetric = { format: formatUptime, axis: shortUptime, zero: true };
const airtime: TileMetric = { format: percent, unit: "%", zero: true };
const rate: TileMetric = { format: perHour, unit: "/h", zero: true };

export type NodeTile = "receptions" | "snr" | "rssi";
export const NODE_METRICS: Record<NodeTile, TileMetric> = { receptions: count, snr, rssi };

export const OBSERVER_METRICS: Record<Exclude<ObserverTile, "types">, TileMetric> = {
  airtime,
  battery,
  uptime,
  packets: count,
  snr,
  rssi,
  noise,
  queue: { format: (v) => formatCount(Math.round(v)), zero: true },
  errors: count,
};

export function telemetryMetrics(tempUnit: TemperatureUnit): Record<TelemetryTile, TileMetric> {
  const temperature = (v: number) => formatTemp(v, tempUnit);
  return {
    battery,
    noise,
    uptime,
    airtime,
    temperature: { format: temperature, axis: temperature },
    packets: rate,
    signal: { format: (v) => `${v.toFixed(1)} dB`, unit: "dB" },
    errors: rate,
  };
}

export type GraphPoint = [number, number | null];

// An hourly series as timed points: each slot at the clock hour it holds.
export function slotPoints(values: (number | null)[], range: AtlasRange, now: number): GraphPoint[] {
  const { time } = hourSlots(range, now);
  return values.map((v, i) => [time(i), v]);
}

// Readings as timed points, with a break where one or more buckets went missing.
export function readingPoints(readings: { t: number; v: number }[], bucketMs: number): GraphPoint[] {
  const out: GraphPoint[] = [];
  readings.forEach((p, i) => {
    const prev = readings[i - 1];
    if (prev && p.t - prev.t > 1.5 * bucketMs) out.push([(prev.t + p.t) / 2, null]);
    out.push([p.t, p.v]);
  });
  return out;
}

export function tileGraphOption(
  points: GraphPoint[],
  c: ChartColors,
  o: TileMetric & { name: string; color: string; missing?: string },
): EChartsOption {
  const y = valueAxis(c, {
    scale: !o.zero,
    name: o.unit,
    nameTextStyle: { color: c.textMuted, fontSize: 10, align: "right" },
  });
  return {
    animation: false,
    useUTC: true,
    backgroundColor: "transparent",
    grid: { left: 12, right: 18, top: 30, bottom: 44, containLabel: true },
    tooltip: {
      trigger: "axis",
      ...tooltipStyle(c),
      axisPointer: { type: "line", lineStyle: { color: c.primary } },
      valueFormatter: (v: unknown) => (typeof v === "number" ? o.format(v) : (o.missing ?? "")),
    },
    xAxis: timeAxis(c),
    yAxis: o.axis ? { ...y, axisLabel: { ...y.axisLabel, formatter: o.axis } } : y,
    dataZoom: [
      { type: "inside" },
      { type: "slider", height: 14, bottom: 10, showDetail: false, borderColor: c.border, fillerColor: withAlpha(c.primary, 0.18), brushSelect: false },
    ],
    series: [
      {
        name: o.name,
        type: "line",
        // A reading with a gap on both sides has no line to show it, so every point gets a dot.
        showSymbol: true,
        symbol: "circle",
        symbolSize: 4,
        connectNulls: false,
        data: points,
        lineStyle: { color: o.color, width: 1.8 },
        itemStyle: { color: o.color },
      },
    ],
  };
}
