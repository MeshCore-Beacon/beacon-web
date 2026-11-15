import type { EChartsOption } from "../stats/echarts-setup";
import type { ChartColors } from "../stats/chartTheme";
import { airtimeOption, metricLineOption, mvToVolts } from "../stats/chartOptions";
import { intervalToMs } from "../stats/transforms";
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

// Airtime is an increment over the span the server reports, so a rate needs that span. No span, or
// a result over 100, means the data is unusable: leave a gap rather than stretch the axis.
function airtimePct(secs: number | undefined, span: number | undefined): number | null {
  if (secs == null || !span) return null;
  const v = Math.round(((secs * 100) / span) * 1000) / 1000;
  return v > 100 ? null : v;
}

// A chart is built only when some point carries its field.
export function buildNodeCharts(data: NodeTelemetry, c: ChartColors, labels: NodeChartLabels): NodeCharts {
  const bucketMs = intervalToMs(data.interval);
  const points = fillGaps(data.points, bucketMs);
  const line = (name: string, color: string, accessor: (p: NodeTelemetryPoint) => number | null) =>
    metricLineOption(points, c, { name, color, accessor, connectNulls: false });
  const out: NodeCharts = {};
  if (has(data.points, (p) => p.batteryMv)) out.battery = line(labels.battery, c.primary, (p) => mvToVolts(p.batteryMv));
  if (has(data.points, (p) => p.temperatureC)) out.temperature = line(labels.temperature, c.green, (p) => p.temperatureC ?? null);
  if (has(data.points, (p) => p.noiseFloorDb)) out.noise = line(labels.noise, c.warn, (p) => p.noiseFloorDb ?? null);
  if (bucketMs != null && (has(data.points, (p) => p.airtimeTxSecs) || has(data.points, (p) => p.airtimeRxSecs))) {
    out.airtime = airtimeOption([], c, bucketMs, false);
    // Status polls are sparse, so mark each point or a lone value would not draw.
    for (const s of out.airtime.series as { name: string; data: unknown; symbol: string; symbolSize: number }[]) {
      s.data = points.map((p) => [p.t, airtimePct(s.name === "TX" ? p.airtimeTxSecs : p.airtimeRxSecs, p.counterSpanSecs)]);
      s.symbol = "circle";
      s.symbolSize = 4;
    }
  }
  return out;
}
