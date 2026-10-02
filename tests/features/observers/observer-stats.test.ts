import { describe, it, expect } from "vitest";
import { getStats, observerNoiseFloor } from "../../../src/features/observers/observer-stats";

describe("getStats", () => {
  it("returns null when metadata is missing", () => {
    expect(getStats(undefined)).toBeNull();
  });

  it("returns null when stats is not an object", () => {
    expect(getStats({ stats: "nope" })).toBeNull();
  });

  it("returns the stats object when present", () => {
    expect(getStats({ stats: { noise_floor: -95, queue_len: 3 } })).toEqual({ noise_floor: -95, queue_len: 3 });
  });
});

describe("observerNoiseFloor", () => {
  it("returns null when statusMetadata is missing", () => {
    expect(observerNoiseFloor({ statusMetadata: undefined })).toBeNull();
  });

  it("returns null when noise_floor is not a finite number", () => {
    expect(observerNoiseFloor({ statusMetadata: { stats: { noise_floor: NaN } } })).toBeNull();
    expect(observerNoiseFloor({ statusMetadata: { stats: { noise_floor: "cold" } } })).toBeNull();
  });

  it("returns the noise floor when it is a finite number", () => {
    expect(observerNoiseFloor({ statusMetadata: { stats: { noise_floor: -102.5 } } })).toBe(-102.5);
  });
});
