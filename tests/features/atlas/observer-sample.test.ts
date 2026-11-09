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
  it("maps ranges to the server's duration strings", () => {
    expect(OBSERVER_RANGE).toEqual({ "24h": "24h", "3d": "72h" });
  });

  it("sums packets heard over the window and ranks the payload types", () => {
    const heard = activity([point(0, 3, 1), point(1, 5, 2), point(30, 99, 0)]);
    heard.payloadTypes = [
      { payloadType: 5, payloadTypeName: "GRP_TXT", count: 2 },
      { payloadType: 4, payloadTypeName: "ADVERT", count: 6 },
      { payloadType: 1, payloadTypeName: "RESPONSE", count: 0 },
    ];
    const sample = summarizeObserver(heard, undefined, undefined, "24h", now);
    expect(sample.heard).toBe(8);
    expect(sample.types).toEqual([{ name: "ADVERT", count: 6 }, { name: "GRP_TXT", count: 2 }]);
  });

  it("takes airtime from the radio's cumulative counters, counting a reboot step as zero", () => {
    const sample = summarizeObserver(undefined, tele([
      { t: now - 3 * HOUR, airtimeTxSecs: 100, airtimeRxSecs: 1000, noiseFloorDb: -110 },
      { t: now - 2 * HOUR, airtimeTxSecs: 136, airtimeRxSecs: 1180, noiseFloorDb: -110 },
      { t: now - HOUR, airtimeTxSecs: 10, airtimeRxSecs: 20, noiseFloorDb: -110 },
    ]), undefined, "24h", now);
    expect(sample.airtimeSource).toBe("radio");
    expect(sample.airtimeTx).toBeCloseTo(0.5);
    expect(sample.airtimeRx).toBeCloseTo(2.5);
    expect(sample.airtime).toBeCloseTo(3);
    expect(sample.airtimeHourly[21]).toBeCloseTo(6);
    expect(sample.airtimeHourly[22]).toBe(0);
    expect(sample.airtimeHourly[20]).toBeNull();
  });

  it("estimates receive airtime from heard packets when the radio has no counters, quiet hours as zero", () => {
    const withAir = (hoursAgo: number, ms: number | null) => ({ ...point(hoursAgo, 1, null), airtimeMs: ms });
    const sample = summarizeObserver(activity([withAir(0, 72_000), withAir(1, null), { ...point(2, null, null) }]), undefined, undefined, "24h", now);
    expect(sample.airtimeSource).toBe("heard");
    expect(sample.airtimeTx).toBeNull();
    // 72 s on air over the 23 hours that were read
    expect(sample.airtime).toBeCloseTo((72 / (23 * 3600)) * 100);
    expect(sample.airtimeRx).toBe(sample.airtime);
    expect(sample.airtimeHourly[23]).toBeCloseTo(2);
    expect(sample.airtimeHourly[22]).toBe(0);
    expect(sample.airtimeHourly[21]).toBeNull();
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
    expect(empty).toMatchObject({ heard: null, types: [], airtime: null, airtimeSource: null, noise: null, battery: null, uptime: null });
    expect(empty.airtimeHourly).toHaveLength(72);
    const sample = summarizeObserver(undefined, tele([{ uptimeSeconds: 10 }]), { uptimeSeconds: 99 } as Observer, "24h", now);
    expect(sample.uptime).toBe(99);
  });
});
