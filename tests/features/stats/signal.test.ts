import { describe, expect, it } from "vitest";
import { signalHours, signalBinLabel, signalHistogramOption, signalTrendOption } from "../../../src/features/stats/signal";
import { readChartColors } from "../../../src/features/stats/chartTheme";
import type { SignalStats } from "../../../src/features/stats/types";

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
    expect(signalBinLabel({ lower: null, upper: -30, count: 2 })).toBe("< -30");
    expect(signalBinLabel({ lower: -30, upper: -25, count: 2 })).toBe("-30 to < -25");
    expect(signalBinLabel({ lower: 30, upper: null, count: 2 })).toBe("≥ 30");
    const colors = readChartColors();
    expect(signalHistogramOption(signalFixture.snr, "SNR", "dB", colors)).toMatchObject({ animation: false, tooltip: { renderMode: "richText" }, aria: { enabled: true } });
    expect(signalTrendOption(signalHours(signalFixture), "snr", colors)).toMatchObject({ animation: false, series: [{ connectNulls: false, showSymbol: true, data: [[0, 0], [hour, null], [2 * hour, 0], [3 * hour, null]] }] });
  });
});
