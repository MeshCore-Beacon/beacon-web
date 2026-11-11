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

  it("excludes future and non-finite readings while preserving an uptime reset", () => {
    const sample = summarizeObserver(activity([point(-5, 999, 99), point(0, 2, 0)]), tele([
      { t: now + HOUR, batteryMv: 99999, noiseFloorDb: -1 },
      { t: now - HOUR, noiseFloorDb: -110, uptimeSeconds: 100 },
      { t: now, noiseFloorDb: -110, batteryMv: NaN, uptimeSeconds: 0 },
    ]), undefined, "24h", now);
    expect(sample.heard).toBe(2);
    expect(sample.battery).toBeNull();
    expect(sample.uptimeHourly.slice(-2)).toEqual([100, 0]);
  });
  it("keeps a bucket that starts just after a lagging tick in the newest slot", () => {
    const sample = summarizeObserver(activity([point(-0.5, 6, 2)]), undefined, undefined, "24h", now);
    expect(sample.counts[23]).toBe(6);
    expect(sample.heard).toBe(6);
  });

  it("prefers the status record's noise floor over telemetry, as the Observers page does", () => {
    const telemetry = tele([{ t: now, noiseFloorDb: -110 }]);
    const reported = { statusMetadata: { stats: { noise_floor: -98 } } } as unknown as Observer;
    expect(summarizeObserver(undefined, telemetry, reported, "24h", now).noise).toBe(-98);
    expect(summarizeObserver(undefined, telemetry, {} as Observer, "24h", now).noise).toBe(-110);
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

  it("ranks the payload types heard, dropping empty ones", () => {
    const heard = activity([point(0, 8, null)]);
    heard.payloadTypes = [
      { payloadType: 5, payloadTypeName: "GRP_TXT", count: 2 },
      { payloadType: 4, payloadTypeName: "ADVERT", count: 6 },
      { payloadType: 1, payloadTypeName: "RESPONSE", count: 0 },
    ];
    expect(summarizeObserver(heard, undefined, undefined, "24h", now).types).toEqual([
      { name: "ADVERT", count: 6 },
      { name: "GRP_TXT", count: 2 },
    ]);
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

  it("estimates receive airtime from heard packets without counters, quiet hours as zero", () => {
    const withAir = (hoursAgo: number, ms: number | null) => ({ ...point(hoursAgo, 1, null), airtimeMs: ms });
    const sample = summarizeObserver(activity([withAir(0, 72_000), withAir(1, null), point(2, null, null)]), undefined, undefined, "24h", now);
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

  it("gives SNR and RSSI per hour and weights the window mean by each hour's packet count", () => {
    const heard = activity([
      { ...point(0, 30, 2), rssiAvg: -100 },
      { ...point(1, 10, 10), rssiAvg: -80 },
      { ...point(2, 5, null), rssiAvg: null },
      { ...point(40, 99, 50), rssiAvg: -10 },
    ]);
    const sample = summarizeObserver(heard, undefined, undefined, "24h", now);
    expect(sample.snrHourly.slice(-3)).toEqual([null, 10, 2]);
    expect(sample.rssiHourly.slice(-3)).toEqual([null, -80, -100]);
    expect(sample.snr).toBeCloseTo(4);
    expect(sample.rssi).toBeCloseTo(-95);
    expect(sample.snrHourly[0]).toBeNull();
  });

  it("keeps a real zero SNR and has no mean without signal readings", () => {
    expect(summarizeObserver(activity([point(0, 4, 0)]), undefined, undefined, "24h", now).snr).toBe(0);
    const none = summarizeObserver(activity([point(0, 4, null)]), undefined, undefined, "24h", now);
    expect(none).toMatchObject({ snr: null, rssi: null });
  });

  it("shows the queue as its latest reading with the last reading of each hour", () => {
    const sample = summarizeObserver(undefined, tele([
      { t: now - 2 * HOUR, queueLength: 4, noiseFloorDb: -110 },
      { t: now - HOUR - 60_000, queueLength: 9, noiseFloorDb: -110 },
      { t: now - HOUR, queueLength: 1, noiseFloorDb: -110 },
    ]), undefined, "24h", now);
    expect(sample.queue).toBe(1);
    expect(sample.queueHourly.slice(-3)).toEqual([4, 1, null]);
  });

  it("turns the cumulative receive-error counter into errors per hour, a reboot step as zero", () => {
    const sample = summarizeObserver(undefined, tele([
      { t: now - 4 * HOUR, receiveErrors: 100 },
      { t: now - 3 * HOUR, receiveErrors: 103 },
      { t: now - 2 * HOUR - 60_000, receiveErrors: 104 },
      { t: now - 2 * HOUR, receiveErrors: 110 },
      { t: now - HOUR, receiveErrors: 2 },
      { t: now, receiveErrors: 7 },
    ]), undefined, "24h", now);
    expect(sample.errorsHourly.slice(-5)).toEqual([null, 3, 7, 0, 5]);
    expect(sample.errors).toBe(15);
    const single = summarizeObserver(undefined, tele([{ t: now, receiveErrors: 50 }]), undefined, "24h", now);
    expect(single.errors).toBeNull();
    expect(single.errorsHourly.every((v) => v === null)).toBe(true);
  });

  it("prefers the observer record's uptime and gives nulls, not NaN, on empty input", () => {
    const empty = summarizeObserver(undefined, undefined, undefined, "3d", now);
    expect(empty).toMatchObject({ heard: null, types: [], airtime: null, airtimeSource: null, noise: null, battery: null, uptime: null, snr: null, rssi: null, queue: null, errors: null });
    expect(empty.counts).toHaveLength(72);
    const sample = summarizeObserver(undefined, tele([{ uptimeSeconds: 10 }]), { uptimeSeconds: 99 } as Observer, "24h", now);
    expect(sample.uptime).toBe(99);
  });
});
