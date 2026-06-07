import { describe, it, expect } from "vitest";
import {
  formatHex,
  formatAbsolute,
  timeAgoMs,
  formatSnr,
  snrLevel,
  formatPropagation,
  microToDeg,
} from "../../src/lib/formatters";

describe("microToDeg", () => {
  it("scales integer microdegrees to decimal degrees", () => {
    expect(microToDeg(45141660)).toBeCloseTo(45.14166, 5);
    expect(microToDeg(-76049320)).toBeCloseTo(-76.04932, 5);
  });

  it("passes through non-integer decimal degrees untouched", () => {
    expect(microToDeg(45.14)).toBe(45.14);
    expect(microToDeg(-76.05)).toBe(-76.05);
    expect(microToDeg(0)).toBe(0);
  });

  it("scales small/near-zero integer microdegrees instead of mistaking them for degrees", () => {
    // regression: a coordinate within ~0.00018° of the equator/prime meridian (e.g. +0.00015° -> the
    // integer 150 microdegrees) must scale to decimal, not pass through as an impossible 150°
    expect(microToDeg(150)).toBeCloseTo(0.00015, 6);
    expect(microToDeg(180)).toBeCloseTo(0.00018, 6);
    expect(microToDeg(-150)).toBeCloseTo(-0.00015, 6);
  });
});

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

describe("formatPropagation", () => {
  it("formats ms to seconds string", () => {
    expect(formatPropagation(1936)).toBe("1.936s");
  });

  it("returns dash for null", () => {
    expect(formatPropagation(null)).toBe("—");
  });
});
