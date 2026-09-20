import type { EChartsOption } from "echarts";
import type { SignalBin, SignalMetric, SignalStats } from "./types";
import { blend, tooltipStyle, withAlpha, type ChartColors } from "./chartTheme";

const HOUR = 3_600_000;
export function signalHours(data: SignalStats | undefined) {
  if (!data || data.until <= data.since) return [];
  const first = Math.floor(data.since / HOUR) * HOUR;
  const rows = new Map(data.hourly.map((row) => [row.hour, row]));
  return Array.from({ length: Math.min(721, Math.ceil((data.until - first) / HOUR)) }, (_, i) => {
    const hour = first + i * HOUR, row = rows.get(hour);
    return {
      hour, receptions: row?.receptions ?? null,
      snrAverage: row && row.snrSamples > 0 ? row.snrAverage : null,
      rssiAverage: row && row.rssiSamples > 0 ? row.rssiAverage : null,
    };
  });
}

export function signalBinLabel(bin: SignalBin) {
  if (bin.lower === null) return `< ${bin.upper}`;
  if (bin.upper === null) return `≥ ${bin.lower}`;
  return `${bin.lower} to < ${bin.upper}`;
}

export function signalHistogramOption(metric: SignalMetric | undefined, name: string, unit: string, c: ChartColors): EChartsOption {
  const bins = metric?.histogram ?? [];
  return {
    animation: false,
    aria: { enabled: true, label: { description: `${name} distribution in ${unit}. Exact bin boundaries and counts follow below.` } },
    grid: { left: 8, right: 10, top: 20, bottom: 16, containLabel: true },
    tooltip: { trigger: "axis", renderMode: "richText", ...tooltipStyle(c) },
    xAxis: { type: "category", data: bins.map((bin) => `${signalBinLabel(bin)} ${unit}`), axisLabel: { color: c.textMuted, fontSize: 9, rotate: 35 }, axisLine: { lineStyle: { color: c.border } } },
    yAxis: { type: "value", minInterval: 1, axisLabel: { color: c.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: c.borderSubtle } } },
    series: [{ name: `${name} samples`, type: "bar", barMaxWidth: 28, data: bins.map((bin, i) => ({ value: bin.count, itemStyle: { color: blend(name === "SNR" ? c.secondary : c.green, c.primary, i / Math.max(1, bins.length - 1)), borderRadius: [3, 3, 0, 0] } })) }],
  };
}

export function signalTrendOption(hours: ReturnType<typeof signalHours>, metric: "snr" | "rssi", c: ChartColors): EChartsOption {
  const color = metric === "snr" ? c.secondary : c.green;
  const unit = metric === "snr" ? "dB" : "dBm";
  return {
    animation: false, useUTC: true,
    aria: { enabled: true, label: { description: `Hourly mean ${metric.toUpperCase()} in ${unit}, UTC. Missing readings remain gaps. Exact values are in the hourly table.` } },
    grid: { left: 8, right: 18, top: 20, bottom: 16, containLabel: true },
    tooltip: { trigger: "axis", renderMode: "richText", ...tooltipStyle(c), valueFormatter: (value) => typeof value === "number" ? `${value.toFixed(2)} ${unit}` : "No sample" },
    xAxis: { type: "time", axisLabel: { color: c.textMuted, fontSize: 10, hideOverlap: true }, axisLine: { lineStyle: { color: c.border } } },
    yAxis: { type: "value", scale: true, axisLabel: { color: c.textMuted, fontSize: 10 }, splitLine: { lineStyle: { color: c.borderSubtle } } },
    series: [{ name: `${metric.toUpperCase()} · ${unit}`, type: "line", connectNulls: false, showSymbol: true, symbolSize: 5,
      lineStyle: { width: 2, color }, itemStyle: { color }, areaStyle: { color: withAlpha(color, 0.08) },
      data: hours.map((hour) => [hour.hour, hour[metric === "snr" ? "snrAverage" : "rssiAverage"]]) }],
  };
}

export function signalCoverageOption(data: SignalStats | undefined, c: ChartColors): EChartsOption {
  return {
    animation: false,
    aria: { enabled: true, label: { description: "Available and unavailable readings for SNR and RSSI. Exact counts and percentages are in the sample availability table." } },
    grid: { left: 8, right: 12, top: 30, bottom: 12, containLabel: true },
    legend: { top: 0, textStyle: { color: c.textMuted } },
    tooltip: { trigger: "axis", renderMode: "richText", ...tooltipStyle(c) },
    xAxis: { type: "value", minInterval: 1, axisLabel: { color: c.textMuted }, splitLine: { lineStyle: { color: c.borderSubtle } } },
    yAxis: { type: "category", data: ["SNR", "RSSI"], axisLabel: { color: c.textNormal }, axisLine: { show: false }, axisTick: { show: false } },
    series: [
      { name: "Available", type: "bar", stack: "samples", barMaxWidth: 22, itemStyle: { color: c.primary }, data: [data?.snr.samples ?? 0, data?.rssi.samples ?? 0] },
      { name: "Unavailable", type: "bar", stack: "samples", itemStyle: { color: c.warn }, data: [data ? data.receptions - data.snr.samples : 0, data ? data.receptions - data.rssi.samples : 0] },
    ],
  };
}
