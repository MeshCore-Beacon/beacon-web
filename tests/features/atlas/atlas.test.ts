import { describe, expect, it } from "vitest";
import { parseAtlas, summarizeReports, ATLAS_LIMIT } from "../../../src/features/atlas/atlas";
import type { NodeObservation } from "../../../src/features/nodes/types";

const pin = { id: "11111111-1111-4111-8111-111111111111", publicKey: "AB".repeat(32), name: "My repeater" };
const now = Date.UTC(2026, 8, 29, 12);
const report = (id: number, hours: number, extra: Partial<NodeObservation> = {}): NodeObservation => ({ id, packetHash: String(id).padStart(64, "0"), payloadType: 4, payloadTypeName: "ADVERT", iata: "YKF", heardAt: now - hours * 3_600_000, ...extra });

describe("saved Atlas", () => {
  it("restores valid ordered full identities, normalizes keys and removes duplicates", () => {
    expect(parseAtlas(JSON.stringify({ version: 1, range: "3d", nodes: [pin, { ...pin, publicKey: pin.publicKey.toLowerCase() }, { ...pin, publicKey: "cd".repeat(32) }] }))).toEqual({ version: 2, range: "3d", cards: [{ ...pin, kind: "node", publicKey: pin.publicKey.toLowerCase() }, { ...pin, kind: "node", publicKey: "cd".repeat(32) }] });
  });
  it("tolerates unavailable, corrupt and future storage, rejects partial keys and caps the collection", () => {
    for (const value of [null, "{", "[]", '{"version":2}', '{"version":1,"nodes":null}']) expect(parseAtlas(value).cards).toEqual([]);
    const nodes = [{ ...pin, publicKey: "abcd" }, { ...pin, id: "../unsafe" }, ...Array.from({ length: 20 }, (_, i) => ({ ...pin, publicKey: i.toString(16).padStart(64, "0") }))];
    const result = parseAtlas(JSON.stringify({ version: 1, range: "30d", nodes }));
    expect(result.cards).toHaveLength(ATLAS_LIMIT);
    expect(result.range).toBe("24h");
  });
});

describe("origin report sample", () => {
  it("counts a report newer than the tick snapshot in the latest hour", () => {
    const sample = summarizeReports([report(1, 0), report(2, -0.01)], "24h", now);
    expect(sample.reports.map((r) => r.id)).toEqual([2, 1]);
    expect(sample.counts).toHaveLength(24);
    expect(sample.counts[23]).toBe(2);
  });

  it("bins the window inclusive of its start, drops older reports, keeps other payload types and dedupes ids", () => {
    const rows = [report(1, 0), report(2, 23.9), report(3, 24), report(4, 24.01), report(5, 1, { payloadType: 99 }), report(1, 0)];
    const sample = summarizeReports(rows, "24h", now);
    expect(sample.reports.map((r) => r.id)).toEqual([1, 5, 2, 3]);
    expect(sample.counts.reduce((a, b) => a + b, 0)).toBe(4);
    expect(sample.counts[23]).toBe(2);
    expect(sample.counts[0]).toBe(2);
    expect(sample.present[0]).toBe(true);
    expect(sample.present[12]).toBe(false);
    expect(summarizeReports(rows, "3d", now).counts).toHaveLength(72);
    expect(summarizeReports(rows, "3d", now).reports).toHaveLength(5);
  });

  it("gives hourly means per bin and null where the hour has no signal sample", () => {
    const sample = summarizeReports([report(1, 0, { snr: 0, rssi: -100 }), report(2, 2, { snr: 8, rssi: -90 }), report(3, 24.01, { snr: 20, rssi: -70 })], "24h", now);
    expect(sample.snrHourly[23]).toBe(0);
    expect(sample.rssiHourly[23]).toBe(-100);
    expect(sample.snrHourly[22]).toBe(8);
    expect(sample.snrHourly[21]).toBeNull();
    expect(sample.snrHourly[0]).toBeNull();
  });

  it("does not turn missing signal into zero and averages real zero SNR samples", () => {
    const sample = summarizeReports([report(1, 1), report(2, 2, { rssi: 0, snr: 0 }), report(3, 3, { rssi: -110, snr: 0, hopCount: 0 }), report(4, 4, { rssi: -90, snr: 10, hopCount: 4 }), report(5, 5, { rssi: NaN, snr: Infinity })], "24h", now);
    expect(sample.snr).toBe(5);
    expect(sample.rssi).toBe(-100);
    expect(sample.hops).toBe(2);
    expect(summarizeReports([], "24h", now).snr).toBeNull();
    expect(summarizeReports([], "24h", now).counts).toHaveLength(24);
  });

  it("starts the bins at the oldest loaded hour when the page was capped", () => {
    const rows = [report(1, 0.5), report(2, 1.5), report(3, 5.2)];
    const full = summarizeReports(rows, "3d", now, false);
    expect(full.counts).toHaveLength(72);
    expect(full.since).toBe(now - 72 * 3_600_000);
    const capped = summarizeReports(rows, "3d", now, true);
    expect(capped.since).toBe(Math.floor((now - 5.2 * 3_600_000) / 3_600_000) * 3_600_000);
    expect(capped.counts).toHaveLength(6);
    expect(capped.counts[0]).toBe(1);
    expect(capped.counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(capped.truncated).toBe(true);
    expect(full.truncated).toBe(false);
    expect(summarizeReports([], "3d", now, true).counts).toHaveLength(72);
  });

  it("is not truncated when more rows exist but the loaded page already reaches past the window", () => {
    const rows = [report(1, 2), report(2, 30), report(3, 100)];
    const sample = summarizeReports(rows, "24h", now, true);
    expect(sample.truncated).toBe(false);
    expect(sample.since).toBe(now - 24 * 3_600_000);
    expect(sample.counts).toHaveLength(24);
    expect(sample.reports.map((r) => r.id)).toEqual([1]);
  });
});
