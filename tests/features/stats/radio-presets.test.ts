import { describe, it, expect } from "vitest";
import { aggregatePresets, formatPreset } from "../../../src/features/stats/transforms";
import type { RadioPreset } from "../../../src/features/stats/types";

const row = (preset: string, sourceType: string, iata: string, count: number): RadioPreset => ({ preset, sourceType, iata, count });

describe("aggregatePresets", () => {
  it("splits each preset into node and observer totals across iatas", () => {
    const rows = [
      row("910.525,62.5,7", "observer", "YVR", 3),
      row("910.525,62.5,7", "node", "YVR", 5),
      row("910.525,62.5,7", "observer", "YYJ", 2),
      row("869.525,250,11", "node", "YVR", 4),
    ];
    const out = aggregatePresets(rows);
    expect(out).toContainEqual({ preset: "910.525,62.5,7", nodes: 5, observers: 5 });
    expect(out).toContainEqual({ preset: "869.525,250,11", nodes: 4, observers: 0 });
  });

  it("returns rows sorted by descending total", () => {
    const rows = [
      row("910.5,62.5,7", "node", "YVR", 1),
      row("868,250,11", "node", "YVR", 5),
      row("868,250,11", "observer", "YVR", 4),
      row("915,125,9", "node", "YVR", 5),
    ];
    expect(aggregatePresets(rows).map((r) => r.preset)).toEqual(["868,250,11", "915,125,9", "910.5,62.5,7"]);
  });

  it("drops junk all-zero presets", () => {
    const rows = [row("910.525,62.5,7", "node", "YVR", 6), row("0,0,0", "observer", "YVR", 1)];
    expect(aggregatePresets(rows).map((r) => r.preset)).toEqual(["910.525,62.5,7"]);
  });

  it("handles an empty input", () => {
    expect(aggregatePresets([])).toEqual([]);
  });
});

describe("formatPreset", () => {
  it("renders freq/bw/sf in a human-readable label", () => {
    expect(formatPreset("910.525,62.5,7")).toBe("910.525 · 62.5k · SF7");
  });

  it("falls back to the raw string when it is not the expected triple", () => {
    expect(formatPreset("weird")).toBe("weird");
  });
});
