/* eslint-disable @typescript-eslint/no-explicit-any -- poking into loose ECharts option shapes */
import { describe, expect, it } from "vitest";
import { summarizeActivity } from "../../../src/features/atlas/atlas";
import { NODE_METRICS, OBSERVER_METRICS, readingPoints, slotPoints, telemetryMetrics, tileGraphOption } from "../../../src/features/atlas/tile-graph";
import type { ChartColors } from "../../../src/features/stats/chartTheme";
import type { NodeActivity } from "../../../src/features/nodes/types";

const HOUR = 3_600_000;
const noon = Date.UTC(2026, 10, 15, 12);
// The card's tick trails the clock, so it rarely sits on the hour.
const now = noon + 25 * 60_000;
const c = { primary: "#111", border: "#222", textMuted: "#333", textBright: "#444", bgRaised: "#555" } as ChartColors;

describe("slotPoints", () => {
  it("gives each hourly slot the clock hour it holds, newest last", () => {
    const points = slotPoints(Array.from({ length: 24 }, (_, i) => (i === 3 ? null : i)), "24h", now);
    expect(points).toHaveLength(24);
    expect(points[23]).toEqual([noon, 23]);
    expect(points[22]).toEqual([noon - HOUR, 22]);
    expect(points[0]).toEqual([noon - 23 * HOUR, 0]);
    expect(points[3]).toEqual([noon - 20 * HOUR, null]);
    expect(slotPoints(Array<number | null>(168).fill(1), "7d", now)[0]![0]).toBe(noon - 167 * HOUR);
  });

  it("puts a bucket back at the hour the server sent it for", () => {
    const hours = [0, 5, 23];
    const activity = { summary: {}, points: hours.map((h) => ({ t: noon - h * HOUR, observations: h + 1, snrAvg: null, rssiAvg: null, hopAvg: null })), latest: null } as unknown as NodeActivity;
    const drawn = slotPoints(summarizeActivity(activity, "24h", now).counts, "24h", now).filter(([, v]) => v);
    expect(drawn).toEqual(hours.reverse().map((h) => [noon - h * HOUR, h + 1]));
  });
});

describe("readingPoints", () => {
  const at = (h: number, v: number) => ({ t: noon - h * HOUR, v });

  it("keeps readings at their own times", () => {
    expect(readingPoints([at(3, 1), at(2, 2), at(1, 3)], HOUR)).toEqual([[noon - 3 * HOUR, 1], [noon - 2 * HOUR, 2], [noon - HOUR, 3]]);
    expect(readingPoints([], HOUR)).toEqual([]);
  });

  it("breaks the line where readings are more than a bucket and a half apart", () => {
    const points = readingPoints([at(6, 1), at(5, 2), at(2, 3), at(1, 4)], HOUR);
    expect(points).toEqual([[noon - 6 * HOUR, 1], [noon - 5 * HOUR, 2], [noon - 3.5 * HOUR, null], [noon - 2 * HOUR, 3], [noon - HOUR, 4]]);
    // the same spacing is no gap in 6h buckets
    expect(readingPoints([at(6, 1), at(5, 2), at(2, 3), at(1, 4)], 6 * HOUR).some(([, v]) => v === null)).toBe(false);
  });
});

describe("tileGraphOption", () => {
  const points = slotPoints([null, -110, null, -108, -107], "24h", now);
  const option = tileGraphOption(points, c, { ...OBSERVER_METRICS.noise, name: "Noise floor", color: "#abc", missing: "none" }) as any;

  it("draws one line of [time, value] pairs in the tile's colour, with gaps left open and a dot on every point", () => {
    const series = option.series[0];
    expect(series).toMatchObject({ type: "line", name: "Noise floor", connectNulls: false, showSymbol: true });
    expect(series.data).toBe(points);
    expect(series.lineStyle.color).toBe("#abc");
    expect(series.itemStyle.color).toBe("#abc");
  });

  it("joins the readings either side of a gap with faint dashes that stay out of the tooltip", () => {
    const bridge = option.series[1];
    expect(option.series).toHaveLength(2);
    // the leading gap has no reading before it, so only the middle one is bridged
    expect(bridge.data).toEqual([points[1], points[3], [points[3]![0], null]]);
    expect(bridge).toMatchObject({ type: "line", showSymbol: false, silent: true, tooltip: { show: false } });
    expect(bridge.lineStyle).toMatchObject({ color: "#abc", type: "dashed" });
    expect(bridge.name).toBeUndefined();
  });

  it("has a UTC time axis, a value axis named by the unit, and wheel, drag and slider zoom", () => {
    expect(option.useUTC).toBe(true);
    expect(option.xAxis.type).toBe("time");
    expect(option.yAxis).toMatchObject({ type: "value", name: "dBm", scale: true });
    expect(option.dataZoom.map((z: any) => z.type)).toEqual(["inside", "slider"]);
  });

  it("writes tooltip values the way the tile does", () => {
    expect(option.tooltip.trigger).toBe("axis");
    expect(option.tooltip.valueFormatter(-109.6)).toBe("-110 dBm");
    expect(option.tooltip.valueFormatter(null)).toBe("none");
    const format = (metric: Parameters<typeof tileGraphOption>[2], v: number) => (tileGraphOption([], c, metric) as any).tooltip.valueFormatter(v);
    const base = { name: "x", color: "#000" };
    expect(format({ ...OBSERVER_METRICS.airtime, ...base }, 4.26)).toBe("4.3%");
    expect(format({ ...OBSERVER_METRICS.battery, ...base }, 4.126)).toBe("4.13V");
    expect(format({ ...OBSERVER_METRICS.uptime, ...base }, 90_000)).toBe("1d 1h 0m");
    expect(format({ ...NODE_METRICS.snr, ...base }, 6.54)).toBe("6.5 dB");
    expect(format({ ...NODE_METRICS.rssi, ...base }, -97.25)).toBe("-97.3 dBm");
    expect(format({ ...NODE_METRICS.receptions, ...base }, 1234)).toBe("1.2k");
    expect(format({ ...telemetryMetrics("c").packets, ...base }, 12.4)).toBe("12/h");
    expect(format({ ...telemetryMetrics("c").signal, ...base }, 9)).toBe("9.0 dB");
    expect(format({ ...telemetryMetrics("c").temperature, ...base }, 20)).toBe("20.0 °C");
    expect(format({ ...telemetryMetrics("f").temperature, ...base }, 20)).toBe("68.0 °F");
  });

  it("starts counts at zero and labels the axis in the tile's words where a number would not read", () => {
    const uptime = tileGraphOption([], c, { ...OBSERVER_METRICS.uptime, name: "Uptime", color: "#000" }) as any;
    expect(uptime.yAxis.scale).toBe(false);
    expect(uptime.yAxis.axisLabel.formatter(90_000)).toBe("1d 1h");
    const temp = tileGraphOption([], c, { ...telemetryMetrics("f").temperature, name: "Temperature", color: "#000" }) as any;
    expect(temp.yAxis.axisLabel.formatter(20)).toBe("68.0 °F");
    expect(option.yAxis.axisLabel.formatter).toBeUndefined();
  });
});
