import { describe, expect, it } from "vitest";
import { trafficModel, trafficHeatmapOption, trafficTrendOption } from "../../../src/features/stats/traffic";
import { readChartColors } from "../../../src/features/stats/chartTheme";
import type { ObservationPoint } from "../../../src/features/stats/types";

const hour = 3_600_000;
const now = Date.UTC(2026, 8, 19, 12, 30);
const end = Date.UTC(2026, 8, 19, 12);
const point = (time: number, iata: string, count: number): ObservationPoint => ({ hour: time, iata, observationCount: count, uniquePackets: 100, activeObservers: 50 });

describe("traffic exploration", () => {
  it("counts receptions, keeps missing hours null, and anchors the bounded window in UTC", () => {
    const data = [point(end - 2 * hour, "YVR", 2), point(end - 2 * hour, "YOW", 3), point(end, "YVR", 7)];
    const before = JSON.stringify(data);
    const model = trafficModel(data, "24h", now);
    expect(model.hours).toHaveLength(24);
    expect(model.hours.at(-2)?.total).toBeNull();
    expect(model.hours.at(-3)?.total).toBe(5);
    expect(model.total).toBe(12);
    expect(model.reportedHours).toBe(2);
    expect(model.areas.map((area) => [area.name, area.total])).toEqual([["YVR", 9], ["YOW", 3]]);
    expect(model.peak?.hour).toBe(end);
    expect(model.peak?.total).toBe(7);
    expect(model.days).toEqual(["2026-09-18", "2026-09-19"]);
    expect(model.heatmap).toContainEqual([12, 1, 7]);
    expect(model.heatmap).not.toContainEqual([11, 1, 0]);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("groups smaller IATAs without losing counts and excludes out-of-window/future rows", () => {
    const data = Array.from({ length: 10 }, (_, i) => point(end, `X${i}`, i + 1));
    data.push(point(end - 25 * hour, "OLD", 1_000), point(end + hour, "FUT", 1_000));
    const model = trafficModel(data, "24h", now);
    expect(model.total).toBe(55);
    expect(model.series).toHaveLength(8);
    expect(model.series.at(-1)?.name).toBe("Other IATAs");
    expect(model.series.reduce((sum, series) => sum + series.total, 0)).toBe(55);
    expect(model.series.reduce((sum, series) => sum + (series.values.at(-1) ?? 0), 0)).toBe(55);
    expect(model.series.at(-1)?.total).toBe(6);
    expect(trafficModel(data, "30d", now).hours).toHaveLength(720);
  });

  it("handles empty data without invented traffic and exposes safe, gap-preserving chart options", () => {
    const model = trafficModel([], "7d", now);
    expect(model.total).toBe(0);
    expect(model.peak).toBeNull();
    expect(model.heatmap).toEqual([]);
    expect(model.hours.every((point) => point.total === null)).toBe(true);
    const populated = trafficModel([point(end, "YOW", 1)], "24h", now);
    const colors = readChartColors();
    expect(trafficHeatmapOption(populated, colors)).toMatchObject({ animation: false, tooltip: { renderMode: "richText" }, visualMap: { min: 0, max: 1 } });
    expect(trafficTrendOption(populated, colors)).toMatchObject({ animation: false, tooltip: { renderMode: "richText" }, series: [{ connectNulls: false }] });
  });
});
