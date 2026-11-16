import { describe, it, expect } from "vitest";
import { telemetryLabel, stableLabels } from "../../../src/features/map/telemetry-label";

const now = 1_800_000_000_000;
const min = 60_000;
const h = 3_600_000;

describe("telemetryLabel", () => {
  it("joins voltage, temperature and age with two spaces", () => {
    expect(telemetryLabel({ nodeId: "a", sampledAt: now - 38 * min, batteryMv: 4080, temperatureC: 1.4 }, "c", now)).toEqual({ text: "4.08V  1°  38m", old: false });
  });
  it("converts the temperature to the instance unit", () => {
    expect(telemetryLabel({ nodeId: "a", sampledAt: now - 38 * min, batteryMv: 4080, temperatureC: 1.4 }, "f", now)?.text).toBe("4.08V  35°  38m");
  });
  it("leaves out a missing value and uses hours", () => {
    expect(telemetryLabel({ nodeId: "a", sampledAt: now - 27 * h, batteryMv: 3920 }, "c", now)).toEqual({ text: "3.92V  27h", old: false });
  });
  it("uses days and flags readings 48h or older", () => {
    expect(telemetryLabel({ nodeId: "a", sampledAt: now - 48 * h, temperatureC: 10 }, "c", now)).toEqual({ text: "10°  2d", old: true });
  });
  it("never shows negative zero", () => {
    expect(telemetryLabel({ nodeId: "a", sampledAt: now - 59 * min, temperatureC: -0.4 }, "c", now)?.text).toBe("0°  59m");
  });
  it("clamps a future sample to 0m", () => {
    expect(telemetryLabel({ nodeId: "a", sampledAt: now + 5 * min, batteryMv: 4000 }, "c", now)?.text).toBe("4.00V  0m");
  });
  it("returns null with neither value", () => {
    expect(telemetryLabel({ nodeId: "a", sampledAt: now }, "c", now)).toBeNull();
  });
});

describe("stableLabels", () => {
  const mk = (e: [string, string, boolean][]) => new Map(e.map(([id, text, old]) => [id, { text, old }]));
  const prev = mk([["a", "4.08V  38m", false], ["b", "3.9V  2d", true]]);

  it("keeps the previous Map when nothing changed", () => {
    expect(stableLabels(prev, mk([["a", "4.08V  38m", false], ["b", "3.9V  2d", true]]))).toBe(prev);
  });
  it("returns the new Map on a changed text, old flag, removal or addition", () => {
    for (const next of [
      mk([["a", "4.08V  39m", false], ["b", "3.9V  2d", true]]),
      mk([["a", "4.08V  38m", true], ["b", "3.9V  2d", true]]),
      mk([["a", "4.08V  38m", false]]),
      mk([["a", "4.08V  38m", false], ["b", "3.9V  2d", true], ["c", "1°  1m", false]]),
    ]) expect(stableLabels(prev, next)).toBe(next);
  });
});
