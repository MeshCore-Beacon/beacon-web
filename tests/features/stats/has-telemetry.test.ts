import { describe, it, expect } from "vitest";
import { hasTelemetry } from "../../../src/features/stats/transforms";
import type { TelemetryPoint } from "../../../src/features/stats/types";

const empty = (t: number): TelemetryPoint => ({ t, batteryMv: null, airtimeTxPct: null, airtimeRxPct: null, noiseFloorDb: null, uptimeSeconds: null, queueLength: null, receiveErrors: null });

describe("hasTelemetry", () => {
  it("is false for no points", () => {
    expect(hasTelemetry([])).toBe(false);
  });

  it("is false when every metric on every point is null", () => {
    expect(hasTelemetry([empty(1), empty(2)])).toBe(false);
  });

  it("is true when any metric on any point is a meaningful non-zero value", () => {
    expect(hasTelemetry([empty(1), { ...empty(2), noiseFloorDb: -110 }])).toBe(true);
  });

  it("is false when every metric is zero (bots / MQTT bridges report all-zero rows)", () => {
    const allZero: TelemetryPoint = { t: 1, batteryMv: 0, airtimeTxPct: 0, airtimeRxPct: 0, noiseFloorDb: 0, uptimeSeconds: 0, queueLength: 0, receiveErrors: 0 };
    expect(hasTelemetry([allZero, allZero])).toBe(false);
  });
});
