import { describe, it, expect } from "vitest";
import {
  formatHex,
  formatTimestamp,
  formatTimeOnly,
  formatSnr,
  snrLevel,
  formatPropagation,
} from "../../src/lib/formatters";

describe("formatHex", () => {
  it("truncates to 8 chars uppercase", () => {
    expect(formatHex("9e9b7d6a91cab445")).toBe("9E9B7D6A");
  });

  it("handles short hashes", () => {
    expect(formatHex("abcd")).toBe("ABCD");
  });
});

describe("formatTimestamp", () => {
  it("formats epoch ms to locale time string", () => {
    const result = formatTimestamp(1747665456000);
    expect(result).toMatch(/\d{1,2}:\d{2}\s?(a\.?m\.?|p\.?m\.?)/i);
  });
});

describe("formatTimeOnly", () => {
  it("formats epoch ms to HH:MM:SS", () => {
    const result = formatTimeOnly(1747665456000);
    expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
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
