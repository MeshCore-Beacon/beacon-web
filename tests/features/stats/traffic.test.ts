import { describe, expect, it } from "vitest";
import { trafficAreaLabel, trafficModel, trafficHeatmapOption, trafficTrendOption } from "../../../src/features/stats/traffic";
import { readChartColors } from "../../../src/features/stats/chartTheme";
import type { ObservationPoint } from "../../../src/features/stats/types";
import i18n from "../../../src/i18n";

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
    expect(trafficHeatmapOption(populated, colors, i18n.getFixedT("en"))).toMatchObject({ animation: false, tooltip: { renderMode: "richText" }, visualMap: { min: 0, max: 1 } });
    expect(trafficTrendOption(populated, colors, i18n.getFixedT("en"))).toMatchObject({ animation: false, tooltip: { renderMode: "richText" }, series: [{ connectNulls: false }] });
  });

  it("translates display labels and plural tooltips without changing the model, UTC cells or gaps", () => {
    const model = trafficModel([point(end - 2 * hour, "YOW", 0), point(end, "YOW", 3), point(end, "", 1)], "24h", now);
    const before = JSON.stringify(model), colors = readChartColors(), en = i18n.getFixedT("en"), fr = i18n.getFixedT("fr");
    expect(trafficAreaLabel("YOW", fr)).toBe("YOW");
    expect(trafficAreaLabel("Unassigned", fr)).toBe("Non attribué");
    expect(trafficAreaLabel("Other IATAs", fr)).toBe("Autres IATA");
    const trend = trafficTrendOption(model, colors, fr);
    expect(trend).toMatchObject({ useUTC: true, series: [{ name: "YOW", connectNulls: false }, { name: "Non attribué" }], aria: { label: { description: expect.stringContaining("lacunes") } } });
    const chartData = (option: typeof trend) => (Array.isArray(option.series) ? option.series : [option.series]).map((series) => series?.data);
    expect(chartData(trend)).toEqual(chartData(trafficTrendOption(model, colors, en)));
    expect(model.hours.slice(-3).map((row) => row.total)).toEqual([0, null, 4]);
    const heatmap = trafficHeatmapOption(model, colors, fr);
    expect(heatmap).toMatchObject({ visualMap: { text: ["Plus", "Moins"], min: 0, max: 4 }, series: [{ name: "Réceptions", data: model.heatmap }] });
    expect(chartData(heatmap)).toEqual(chartData(trafficHeatmapOption(model, colors, en)));
    const tooltip = (option: typeof heatmap) => (option as { tooltip: { formatter: (item: { value: number[] }) => string } }).tooltip.formatter;
    expect(tooltip(heatmap)({ value: [12, 1, 1] })).toBe("2026-09-19 12:00 UTC\n1 réception");
    expect(tooltip(heatmap)({ value: [12, 1, 1200] })).toBe(`2026-09-19 12:00 UTC\n${(1200).toLocaleString()} réceptions`);
    expect(tooltip(trafficHeatmapOption(model, colors, en))({ value: [12, 1, 1] })).toBe("2026-09-19 12:00 UTC\n1 reception");
    expect(JSON.stringify(model)).toBe(before);
  });
});
