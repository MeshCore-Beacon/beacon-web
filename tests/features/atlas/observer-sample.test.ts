import { describe, expect, it } from "vitest";
import { summarizeObserver, OBSERVER_RANGE } from "../../../src/features/atlas/observer-sample";
import type { ObserverActivity, ObserverTelemetry } from "../../../src/features/stats/types";
import type { Observer } from "../../../src/features/observers/types";

const HOUR = 3_600_000;
const now = Date.UTC(2026, 9, 13, 12, 30);
const point = (hoursAgo: number, observations: number | null, snrAvg: number | null) =>
  ({ t: now - hoursAgo * HOUR, observations, snrAvg, snrMin: null, rssiAvg: null, airtimeMs: null });
const activity = (points: ReturnType<typeof point>[]) => ({ range: "24h", interval: "1h", radio: null, payloadTypes: [], points }) as ObserverActivity;
const tele = (points: Partial<ObserverTelemetry["points"][number]>[]) => ({ range: "24h", interval: "1h", points: points.map((p) => ({
  t: now, batteryMv: null, airtimeTxSecs: null, airtimeRxSecs: null, noiseFloorDb: null, uptimeSeconds: null, queueLength: null, receiveErrors: null, ...p })) }) as ObserverTelemetry;

describe("summarizeObserver", () => {
  it("does not fill missing endpoints or unread rollup hours with measured zeros", () => {
    expect(summarizeObserver(undefined, undefined, undefined, "24h", now).counts.every(v => v === null)).toBe(true);
    const sample = summarizeObserver({ ...activity([]), rawFrom: now - HOUR }, undefined, undefined, "24h", now);
    expect(sample.counts[0]).toBeNull();
    expect(sample.counts.at(-1)).toBe(0);
    expect(sample.partial).toBe(true);
  });

  it("shows an available status battery without inventing history", () => {
    const sample = summarizeObserver(undefined, undefined, { batteryLevel: 4.17 } as Observer, "24h", now);
    expect(sample.battery).toBe(4.17);
    expect(sample.batteryHourly.every(v => v === null)).toBe(true);
  });

  it("excludes future and non-finite readings while preserving a real zero SNR and uptime reset", () => {
    const sample = summarizeObserver(activity([point(-5, 999, 99), point(0, 2, 0)]), tele([
      { t: now + HOUR, batteryMv: 99999, noiseFloorDb: -1 },
      { t: now - HOUR, noiseFloorDb: -110, uptimeSeconds: 100 },
      { t: now, noiseFloorDb: -110, batteryMv: NaN, uptimeSeconds: 0 },
    ]), undefined, "24h", now);
    expect(sample.heard).toBe(2);
    expect(sample.snr).toBe(0);
    expect(sample.battery).toBeNull();
    expect(sample.uptimeHourly.slice(-2)).toEqual([100, 0]);
  });
  it("maps ranges to the server's duration strings", () => {
    expect(OBSERVER_RANGE).toEqual({ "24h": "24h", "3d": "72h" });
  });

  it("bins packets heard per hour over the window, newest last, and sums them", () => {
    const sample = summarizeObserver(activity([point(0, 3, 1), point(1, 5, 2), point(30, 99, 0)]), undefined, undefined, "24h", now);
    expect(sample.counts).toHaveLength(24);
    expect(sample.counts[23]).toBe(3);
    expect(sample.counts[22]).toBe(5);
    expect(sample.counts[0]).toBe(0);
    expect(sample.heard).toBe(8);
  });

  it("weights the mean SNR by packets and leaves silent hours null", () => {
    const sample = summarizeObserver(activity([point(0, 1, 10), point(1, 3, 2), point(2, 0, 7), point(3, null, null)]), undefined, undefined, "24h", now);
    expect(sample.snr).toBeCloseTo(4);
    expect(sample.snrHourly[23]).toBe(10);
    expect(sample.snrHourly[21]).toBeNull();
    expect(sample.counts[20]).toBeNull();
  });

  it("takes the latest noise floor and battery, ignoring all-zero rows", () => {
    const sample = summarizeObserver(undefined, tele([
      { t: now - 2 * HOUR, noiseFloorDb: -118, batteryMv: 4050 },
      { t: now - HOUR, noiseFloorDb: 0, batteryMv: 0 },
      { t: now - 3 * HOUR, noiseFloorDb: -121, batteryMv: null },
    ]), undefined, "24h", now);
    expect(sample.noise).toBe(-118);
    expect(sample.battery).toBeCloseTo(4.05);
    expect(sample.noiseHourly[20]).toBe(-121);
    expect(sample.noiseHourly[21]).toBe(-118);
    expect(sample.noiseHourly[22]).toBeNull();
  });

  it("treats a zero battery reading on an otherwise live row as no battery", () => {
    const sample = summarizeObserver(undefined, tele([{ t: now - HOUR, batteryMv: 0, noiseFloorDb: -96, uptimeSeconds: 5 }]), undefined, "24h", now);
    expect(sample.noise).toBe(-96);
    expect(sample.battery).toBeNull();
    expect(sample.batteryHourly[22]).toBeNull();
    expect(sample.uptime).toBe(5);
  });

  it("prefers the observer record's uptime and gives nulls, not NaN, on empty input", () => {
    const empty = summarizeObserver(undefined, undefined, undefined, "3d", now);
    expect(empty).toMatchObject({ heard: null, snr: null, noise: null, battery: null, uptime: null });
    expect(empty.counts).toHaveLength(72);
    const sample = summarizeObserver(undefined, tele([{ uptimeSeconds: 10 }]), { uptimeSeconds: 99 } as Observer, "24h", now);
    expect(sample.uptime).toBe(99);
  });
});
