import { describe, it, expect } from "vitest";
import {
  formatRadio,
  formatRadioParts,
  formatHex,
  formatAbsolute,
  timeAgoMs,
  formatSnr,
  snrLevel,
  formatPropagation,
  formatCount,
  formatClockDrift,
  formatRatePerDay,
} from "../../src/lib/formatters";

const DAY_MS = 86_400_000;

describe("formatHex", () => {
  it("truncates to 8 chars uppercase", () => {
    expect(formatHex("9e9b7d6a91cab445")).toBe("9E9B7D6A");
  });

  it("handles short hashes", () => {
    expect(formatHex("abcd")).toBe("ABCD");
  });
});

describe("formatAbsolute", () => {
  it("formats epoch ms as YYYY-MM-DD HH:MM:SS (no ms by default)", () => {
    const result = formatAbsolute(1717689045123);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("appends .mmm when ms is requested, preserving the millisecond component", () => {
    const result = formatAbsolute(1717689045123, { ms: true });
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(result.endsWith(".123")).toBe(true); // ms component is timezone-independent
  });
});

describe("timeAgoMs", () => {
  it("renders sub-minute as seconds and minutes/hours/days above that", () => {
    const now = Date.now();
    expect(timeAgoMs(now - 5_000)).toBe("5s");
    expect(timeAgoMs(now - 5 * 60_000)).toBe("5m");
    expect(timeAgoMs(now - 3 * 3_600_000)).toBe("3h");
    expect(timeAgoMs(now - 2 * 86_400_000)).toBe("2d");
  });

  it("clamps future timestamps (clock skew) to 0s", () => {
    expect(timeAgoMs(Date.now() + 60_000)).toBe("0s");
  });
});

describe("snrLevel", () => {
  it("returns good for SNR >= 10", () => {
    expect(snrLevel(10.5)).toBe("good");
  });

  it("returns mid for SNR between 5 and 10", () => {
    expect(snrLevel(7.2)).toBe("mid");
  });

  it("returns bad for SNR < 5", () => {
    expect(snrLevel(3.1)).toBe("bad");
  });

  it("returns null for null input", () => {
    expect(snrLevel(null)).toBeNull();
  });
});

describe("formatSnr", () => {
  it("formats to 2 decimal places", () => {
    expect(formatSnr(10.756)).toBe("10.76");
  });

  it("returns dash for null", () => {
    expect(formatSnr(null)).toBe("—");
  });
});

describe("formatCount", () => {
  it("passes small counts through and abbreviates k/M", () => {
    expect(formatCount(932)).toBe("932");
    expect(formatCount(14732)).toBe("14.7k");
    expect(formatCount(8_900_000)).toBe("8.9M");
  });

  it("returns dash for null", () => {
    expect(formatCount(null)).toBe("—");
  });

  it("rolls over to the next unit when rounding reaches 1000", () => {
    // regression: 999_999 used to render as "1000k" instead of rolling to "1M"
    expect(formatCount(999_949)).toBe("999.9k");
    expect(formatCount(999_999)).toBe("1M");
    expect(formatCount(999_999_999)).toBe("1B");
    expect(formatCount(-999_999)).toBe("-1M");
  });
});

describe("formatPropagation", () => {
  it("formats ms to seconds string", () => {
    expect(formatPropagation(1936)).toBe("1.936s");
  });

  it("returns dash for null", () => {
    expect(formatPropagation(null)).toBe("—");
  });
});

describe("formatClockDrift", () => {
  it("labels a zero drift as in sync", () => {
    expect(formatClockDrift(0)).toBe("in sync");
  });

  it("shows sub-minute drift with a sign and direction word", () => {
    expect(formatClockDrift(42)).toBe("+42s ahead");
    expect(formatClockDrift(-45)).toBe("-45s behind");
  });

  it("breaks out minutes and hours, dropping seconds once hours appear", () => {
    expect(formatClockDrift(432)).toBe("+7m 12s ahead"); // 7*60 + 12
    expect(formatClockDrift(-3670)).toBe("-1h 1m behind"); // 3670 -> 1h 1m
  });

  it("renders exact minute/hour boundaries with a zero remainder", () => {
    expect(formatClockDrift(60)).toBe("+1m 0s ahead");
    expect(formatClockDrift(3600)).toBe("+1h 0m ahead");
  });
});

describe("formatRatePerDay", () => {
  it("equals the compacted count over a one-day window", () => {
    expect(formatRatePerDay(1240, DAY_MS)).toBe("1.2k/d");
    expect(formatRatePerDay(340, DAY_MS)).toBe("340/d");
  });

  it("divides the count by the window in days and rounds to a whole rate", () => {
    expect(formatRatePerDay(1240, 7 * DAY_MS)).toBe("177/d"); // 177.14 -> 177
    expect(formatRatePerDay(340, 7 * DAY_MS)).toBe("49/d"); // 48.57 -> 49
  });

  it("keeps one decimal for sub-ten rates so small counts don't vanish", () => {
    expect(formatRatePerDay(12, 30 * DAY_MS)).toBe("0.4/d"); // 0.4/day
    expect(formatRatePerDay(138, 30 * DAY_MS)).toBe("4.6/d"); // 4.6/day
  });

  it("returns a zero rate for a zero count or a zero window", () => {
    expect(formatRatePerDay(0, 7 * DAY_MS)).toBe("0/d");
    expect(formatRatePerDay(5, 0)).toBe("0/d");
  });

  it("shows a dash for a missing count, matching formatCount", () => {
    expect(formatRatePerDay(null, 7 * DAY_MS)).toBe("—");
    expect(formatRatePerDay(undefined, 7 * DAY_MS)).toBe("—");
  });
});

describe("formatRadioParts", () => {
  it("lists frequency, spreading factor, bandwidth and coding rate in the observer panel's order", () => {
    expect(formatRadioParts({ freqMhz: 910.525, sf: 7, bwKhz: 62.5, cr: 5 })).toBe("910.525 MHz · SF7 · 62.5 kHz · CR 4/5");
  });

  it("leaves out whatever is unknown and is null when nothing is", () => {
    expect(formatRadioParts({ freqMhz: 910.525, sf: 7, bwKhz: 62.5 })).toBe("910.525 MHz · SF7 · 62.5 kHz");
    expect(formatRadioParts({ sf: 11 })).toBe("SF11");
    expect(formatRadioParts({})).toBeNull();
  });

  it("backs the compact-string formatter so both read the same", () => {
    expect(formatRadio("915,250,11")).toBe(formatRadioParts({ freqMhz: 915, sf: 11, bwKhz: 250 }));
  });
});
