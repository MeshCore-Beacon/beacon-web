import { describe, expect, it } from "vitest";
import { DOT_LIMIT, sparkValues, summarizeTelemetry, telemetryInterval, telemetryRange } from "../../../src/features/atlas/telemetry-sample";
import type { NodeTelemetry, NodeTelemetryPoint } from "../../../src/features/nodes/types";

const HOUR = 3_600_000;
const now = Date.UTC(2026, 10, 15, 12);
const point = (hoursAgo: number, extra: Partial<NodeTelemetryPoint> = {}): NodeTelemetryPoint => ({ t: now - hoursAgo * HOUR, readings: 1, ...extra });
const data = (points: NodeTelemetryPoint[]): NodeTelemetry => ({ range: "24h", interval: "1h", polled: true, untrustedReadings: 0, points });

// Shaped like the API contract's example: counters are increases that cover counterSpanSecs.
const readings = data([
  point(20, { batteryMv: 4180, noiseFloorDb: -110, uptimeSeconds: 900_000, airtimeTxSecs: 36, airtimeRxSecs: 360, packetsReceived: 400, packetsSent: 20, receiveErrors: 5, counterSpanSecs: 21_600, lastSnrDb: 9.5, lastRssiDb: -31 }),
  point(14, { batteryMv: 4170, noiseFloorDb: -108, uptimeSeconds: 921_600, airtimeTxSecs: 21.6, airtimeRxSecs: 216, packetsReceived: 800, packetsSent: 36, receiveErrors: 0, counterSpanSecs: 21_600, lastSnrDb: 10, lastRssiDb: -28 }),
  // rebooted since the last reading
  point(8, { batteryMv: 4150, noiseFloorDb: -112, uptimeSeconds: 7_200 }),
  point(2, { batteryMv: 4226, noiseFloorDb: -97, uptimeSeconds: 28_800, airtimeTxSecs: 43.2, airtimeRxSecs: 432, packetsReceived: 1_200, packetsSent: 60, receiveErrors: 36, counterSpanSecs: 21_600, lastSnrDb: 12, lastRssiDb: -20 }),
]);

describe("telemetryRange", () => {
  it("asks 24h for the 24h card", () => {
    expect(telemetryRange("24h", true)).toBe("24h");
    expect(telemetryRange("24h", false)).toBe("24h");
  });
  it("asks 72h for the 3d card when the server has atlasTelemetry, else 168h", () => {
    expect(telemetryRange("3d", true)).toBe("72h");
    expect(telemetryRange("3d", false)).toBe("168h");
  });
  it("asks 168h in hourly buckets for the 7d card, and leaves the other ranges on their default bucket", () => {
    expect(telemetryRange("7d", true)).toBe("168h");
    expect(telemetryRange("7d", false)).toBe("168h");
    expect(telemetryInterval("7d")).toBe("1h");
    expect(telemetryInterval("3d")).toBeUndefined();
    expect(telemetryInterval("24h")).toBeUndefined();
  });
});

describe("summarizeTelemetry", () => {
  const s = summarizeTelemetry(readings, "24h", now);

  it("takes the latest battery in volts, noise in dBm and uptime in seconds", () => {
    expect(s.battery.latest).toBeCloseTo(4.226);
    expect(s.battery.values).toHaveLength(4);
    expect(s.noise.latest).toBe(-97);
    expect(s.uptime.latest).toBe(28_800);
  });

  it("marks a drop in uptime as a reboot", () => {
    expect(s.rebooted).toBe(true);
    expect(summarizeTelemetry(data([point(3, { uptimeSeconds: 10 }), point(1, { uptimeSeconds: 20 })]), "24h", now).rebooted).toBe(false);
  });

  it("works airtime out from the counters and counterSpanSecs, skipping points without them", () => {
    // 43.2 s TX and 432 s RX over 21600 s is 0.2 % and 2 %
    expect(s.airtimeTx).toBeCloseTo(0.2, 3);
    expect(s.airtimeRx).toBeCloseTo(2, 3);
    expect(s.airtime.latest).toBeCloseTo(2.2, 3);
    expect(s.airtime.values).toHaveLength(3);
  });

  it("gives packets and errors per hour over the span, and the sent rate at the same reading", () => {
    expect(s.packets.latest).toBeCloseTo(200);
    expect(s.packetsSent).toBeCloseTo(10);
    expect(s.errors.latest).toBeCloseTo(6);
    expect(s.errors.values).toHaveLength(3);
  });

  it("reports the last SNR and RSSI the repeater gave", () => {
    expect(s.signal.latest).toBe(12);
    expect(s.rssi).toBe(-20);
  });

  it("has no temperature when no reading carries one", () => {
    expect(s.temperature).toEqual({ latest: null, values: [], points: [] });
    const warm = summarizeTelemetry(data([point(2, { temperatureC: 16.5 }), point(1, {})]), "24h", now);
    expect(warm.temperature.latest).toBe(16.5);
  });

  it("treats a counter without a span, or over 100 percent, as no value", () => {
    const odd = summarizeTelemetry(data([point(1, { airtimeTxSecs: 5, airtimeRxSecs: 5 }), point(2, { airtimeTxSecs: 30_000, airtimeRxSecs: 1, counterSpanSecs: 21_600 })]), "24h", now);
    expect(odd.airtime.latest).toBeNull();
    expect(odd.packets.latest).toBeNull();
  });

  it("ignores a zero battery reading", () => {
    expect(summarizeTelemetry(data([point(1, { batteryMv: 0 })]), "24h", now).battery.latest).toBeNull();
  });

  it("keeps only the card's window: 72 hours for 3d, 24 for 24h", () => {
    const week = data([point(100, { batteryMv: 3000 }), point(60, { batteryMv: 3900 }), point(5, { batteryMv: 4100 })]);
    expect(summarizeTelemetry(week, "3d", now).battery.values).toEqual([3.9, 4.1]);
    expect(summarizeTelemetry(week, "24h", now).battery.values).toEqual([4.1]);
    expect(summarizeTelemetry(week, "7d", now).battery.values).toEqual([3, 3.9, 4.1]);
  });

  it("keeps each reading's time beside its value, and the server's bucket", () => {
    const s = summarizeTelemetry(readings, "24h", now);
    expect(s.battery.points).toEqual([20, 14, 8, 2].map((h, i) => ({ t: now - h * HOUR, v: [4.18, 4.17, 4.15, 4.226][i] })));
    expect(s.battery.points.map((p) => p.v)).toEqual(s.battery.values);
    // the reading without counters carries no airtime, so it has no point either
    expect(s.airtime.points.map((p) => p.t)).toEqual([20, 14, 2].map((h) => now - h * HOUR));
    expect(s.airtime.points.map((p) => p.v)).toEqual(s.airtime.values);
    expect(s.bucketMs).toBe(HOUR);
    expect(summarizeTelemetry({ ...readings, interval: "6h" }, "3d", now).bucketMs).toBe(6 * HOUR);
    expect(summarizeTelemetry(undefined, "24h", now).bucketMs).toBe(HOUR);
  });

  it("is empty with no data", () => {
    const empty = summarizeTelemetry(undefined, "24h", now);
    expect(empty.battery.latest).toBeNull();
    expect(empty.latestAt).toBeNull();
  });

  it("records when the newest reading in the window was", () => {
    expect(s.latestAt).toBe(now - 2 * HOUR);
  });
});

describe("sparkValues", () => {
  it("spaces a few readings apart so each draws as a dot", () => {
    expect(sparkValues([1, 2, 3])).toEqual([1, null, 2, null, 3]);
    expect(sparkValues([5])).toEqual([5]);
    expect(sparkValues([])).toEqual([]);
  });
  it("keeps the readings joined once there are enough for a line", () => {
    const line = Array.from({ length: DOT_LIMIT }, (_, i) => i);
    expect(sparkValues(line)).toEqual(line);
    expect(sparkValues(line.slice(1))).toHaveLength(DOT_LIMIT * 2 - 3);
  });
});
