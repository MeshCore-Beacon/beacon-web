import type { EChartsOption } from "../stats/echarts-setup";
import type { ChartColors } from "../stats/chartTheme";
import { airtimeOption, metricLineOption, mvToVolts } from "../stats/chartOptions";
import { intervalToMs } from "../stats/transforms";
import { airtimePct } from "./telemetry";
import type { NodeTelemetry, NodeTelemetryPoint } from "./types";

// The server skips empty buckets. Put an empty point in each one so the line breaks there
// instead of joining across a missed poll.
export function fillGaps(points: NodeTelemetryPoint[], intervalMs: number | null): NodeTelemetryPoint[] {
  if (intervalMs == null || intervalMs <= 0) return points;
  const out: NodeTelemetryPoint[] = [];
  for (const p of points) {
    const prev = out.at(-1);
    if (prev) for (let t = prev.t + intervalMs; t < p.t; t += intervalMs) out.push({ t, readings: 0 });
    out.push(p);
  }
  return out;
}

export interface NodeCharts {
  battery?: EChartsOption;
  temperature?: EChartsOption;
  noise?: EChartsOption;
  airtime?: EChartsOption;
}

export interface NodeChartLabels {
  battery: string;
  temperature: string;
  noise: string;
}

const has = (points: NodeTelemetryPoint[], pick: (p: NodeTelemetryPoint) => number | undefined) =>
  points.some((p) => pick(p) != null);

// Status polls are sparse, so every series gets small markers or a lone value between gaps would not draw.
const MARKER_SIZE = 3;
function withMarkers(option: EChartsOption): EChartsOption {
  for (const s of option.series as { symbol: string; symbolSize: number }[]) {
    s.symbol = "circle";
    s.symbolSize = MARKER_SIZE;
  }
  return option;
}

// A chart is built only when some point carries its field.
export function buildNodeCharts(data: NodeTelemetry, c: ChartColors, labels: NodeChartLabels): NodeCharts {
  const bucketMs = intervalToMs(data.interval);
  const points = fillGaps(data.points, bucketMs);
  const line = (name: string, color: string, accessor: (p: NodeTelemetryPoint) => number | null) =>
    withMarkers(metricLineOption(points, c, { name, color, accessor, connectNulls: false }));
  const out: NodeCharts = {};
  if (has(data.points, (p) => p.batteryMv)) out.battery = line(labels.battery, c.primary, (p) => mvToVolts(p.batteryMv));
  if (has(data.points, (p) => p.temperatureC)) out.temperature = line(labels.temperature, c.green, (p) => p.temperatureC ?? null);
  if (has(data.points, (p) => p.noiseFloorDb)) out.noise = line(labels.noise, c.warn, (p) => p.noiseFloorDb ?? null);
  if (bucketMs != null && (has(data.points, (p) => p.airtimeTxSecs) || has(data.points, (p) => p.airtimeRxSecs))) {
    out.airtime = airtimeOption([], c, bucketMs, false);
    for (const s of out.airtime.series as { name: string; data: unknown }[]) {
      s.data = points.map((p) => [p.t, airtimePct(s.name === "TX" ? p.airtimeTxSecs : p.airtimeRxSecs, p.counterSpanSecs)]);
    }
    withMarkers(out.airtime);
  }
  return out;
}
