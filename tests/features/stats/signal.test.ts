import { describe, expect, it } from "vitest";
import { signalHours, signalBinLabel, signalHistogramOption, signalTrendOption, signalCoverageOption } from "../../../src/features/stats/signal";
import { readChartColors } from "../../../src/features/stats/chartTheme";
import type { SignalStats } from "../../../src/features/stats/types";
import i18n from "../../../src/i18n";

const en = i18n.getFixedT("en");
const fr = i18n.getFixedT("fr");

const hour = 3_600_000;
export const signalFixture: SignalStats = {
  since: hour / 2, until: 3 * hour + hour / 2, receptions: 100,
  snr: { samples: 80, average: 0, histogram: [{ lower: null, upper: -30, count: 2 }, { lower: -30, upper: -25, count: 78 }, { lower: 30, upper: null, count: 0 }] },
  rssi: { samples: 90, average: -102.5, histogram: [{ lower: -110, upper: -100, count: 90 }] },
  hourly: [
    { hour: 0, receptions: 50, snrSamples: 50, snrAverage: 0, rssiSamples: 50, rssiAverage: -100 },
    { hour: 2 * hour, receptions: 40, snrSamples: 30, snrAverage: 0, rssiSamples: 40, rssiAverage: -105.625 },
    { hour: 3 * hour, receptions: 10, snrSamples: 0, snrAverage: null, rssiSamples: 0, rssiAverage: null },
  ],
};

describe("signal analytics", () => {
  it("keeps UTC window edges, true zeros, missing hours and missing readings distinct", () => {
    const before = JSON.stringify(signalFixture);
    const hours = signalHours(signalFixture);
    expect(hours.map((h) => h.hour)).toEqual([0, hour, 2 * hour, 3 * hour]);
    expect(hours.map((h) => h.snrAverage)).toEqual([0, null, 0, null]);
    expect(hours.map((h) => h.receptions)).toEqual([50, null, 40, 10]);
    expect(JSON.stringify(signalFixture)).toBe(before);
    expect(signalHours(undefined)).toEqual([]);
    expect(signalHours({ ...signalFixture, until: 30 * 24 * hour + hour / 2, hourly: [] })).toHaveLength(721);
  });
  it("labels exact half-open bins including overflow without assigning quality ratings", () => {
    expect(signalBinLabel({ lower: null, upper: -30, count: 2 }, en)).toBe("< -30");
    expect(signalBinLabel({ lower: -30, upper: -25, count: 2 }, en)).toBe("-30 to < -25");
    expect(signalBinLabel({ lower: 30, upper: null, count: 2 }, en)).toBe("≥ 30");
    const colors = readChartColors();
    expect(signalHistogramOption(signalFixture.snr, "SNR", "dB", colors, en)).toMatchObject({ animation: false, tooltip: { renderMode: "richText" }, aria: { enabled: true } });
    expect(signalTrendOption(signalHours(signalFixture), "snr", colors, en)).toMatchObject({ animation: false, series: [{ connectNulls: false, showSymbol: true, data: [[0, 0], [hour, null], [2 * hour, 0], [3 * hour, null]] }] });
  });

  it("translates plotted text without changing bin boundaries, coverage counts or UTC gaps", () => {
    const before = JSON.stringify(signalFixture), colors = readChartColors();
    expect(signalHistogramOption(signalFixture.snr, "SNR", "dB", colors, fr)).toMatchObject({
      tooltip: { renderMode: "richText" },
      aria: { label: { description: expect.stringContaining("Distribution du SNR en dB") } },
      xAxis: { data: ["< -30 dB", "-30 à < -25 dB", "≥ 30 dB"] },
      series: [{ name: "Échantillons SNR", data: [{ value: 2 }, { value: 78 }, { value: 0 }] }],
    });
    expect(signalCoverageOption(signalFixture, colors, fr)).toMatchObject({
      series: [{ name: "Disponibles", data: [80, 90] }, { name: "Indisponibles", data: [20, 10] }],
    });
    const trend = signalTrendOption(signalHours(signalFixture), "snr", colors, fr);
    expect(trend).toMatchObject({ useUTC: true, series: [{ connectNulls: false, data: [[0, 0], [hour, null], [2 * hour, 0], [3 * hour, null]] }] });
    const tooltip = trend.tooltip as { valueFormatter: (value: unknown) => string };
    expect(tooltip.valueFormatter(null)).toBe("Aucun échantillon");
    expect(tooltip.valueFormatter(0)).toBe("0.00 dB");
    expect(JSON.stringify(signalFixture)).toBe(before);
  });
});
