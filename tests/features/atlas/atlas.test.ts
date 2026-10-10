import { describe, expect, it } from "vitest";
import { parseAtlas, summarizeReports, ATLAS_LIMIT } from "../../../src/features/atlas/atlas";
import type { NodeObservation } from "../../../src/features/nodes/types";

const pin = { id: "11111111-1111-4111-8111-111111111111", publicKey: "AB".repeat(32), name: "My repeater" };
const now = Date.UTC(2026, 8, 29, 12);
const report = (id: number, hours: number, extra: Partial<NodeObservation> = {}): NodeObservation => ({ id, packetHash: String(id).padStart(64, "0"), payloadType: 4, payloadTypeName: "ADVERT", iata: "YKF", heardAt: now - hours * 3_600_000, ...extra });

describe("saved Atlas", () => {
  it("restores valid ordered full identities, normalizes keys and removes duplicates", () => {
    expect(parseAtlas(JSON.stringify({ version: 1, range: "3d", nodes: [pin, { ...pin, publicKey: pin.publicKey.toLowerCase() }, { ...pin, publicKey: "cd".repeat(32) }] }))).toEqual({ version: 1, range: "3d", nodes: [{ ...pin, publicKey: pin.publicKey.toLowerCase() }, { ...pin, publicKey: "cd".repeat(32) }] });
  });
  it("tolerates unavailable, corrupt and future storage, rejects partial keys and caps the collection", () => {
    for (const value of [null, "{", "[]", '{"version":2}', '{"version":1,"nodes":null}']) expect(parseAtlas(value).nodes).toEqual([]);
    const nodes = [{ ...pin, publicKey: "abcd" }, { ...pin, id: "../unsafe" }, ...Array.from({ length: 20 }, (_, i) => ({ ...pin, publicKey: i.toString(16).padStart(64, "0") }))];
    const result = parseAtlas(JSON.stringify({ version: 1, range: "30d", nodes }));
    expect(result.nodes).toHaveLength(ATLAS_LIMIT);
    expect(result.range).toBe("24h");
  });
});

describe("origin report sample", () => {
  it("aligns signal charts with the activity window and preserves missing hours", () => {
    const sample = summarizeReports([report(1, 0, { snr: 0, rssi: -100 }), report(2, 2, { snr: 8, rssi: -90 }), report(3, 24, { snr: 20, rssi: -70 })], "24h", now);
    expect(sample.snrBins[23]).toBe(0);
    expect(sample.rssiBins[23]).toBe(-100);
    expect(sample.snrBins[22]).toBe(8);
    expect(sample.snrBins[21]).toBeNull();
    expect(sample.snrBins[0]).toBeNull();
    expect(sample.bins[23]).toBe(1);
  });

  it("bins the selected window, excludes future/old reports, includes other payload types and deduplicates IDs", () => {
    const rows = [report(1, 0), report(2, 23.9), report(3, 24), report(4, -1), report(5, 1, { payloadType: 99 }), report(1, 0)];
    const sample = summarizeReports(rows, "24h", now);
    expect(sample.reports.map(r => r.id)).toEqual([1, 5, 2]);
    expect(sample.bins.reduce((a, b) => a + b, 0)).toBe(3);
    expect(sample.bins[23]).toBe(2);
    expect(sample.bins[0]).toBe(1);
    expect(summarizeReports(rows, "3d", now).reports).toHaveLength(4);
  });
  it("does not turn missing signal into zero and averages real zero SNR samples", () => {
    const sample = summarizeReports([report(1, 1), report(2, 2, { rssi: 0, snr: 0 }), report(3, 3, { rssi: -110, snr: 0, hopCount: 0 }), report(4, 4, { rssi: -90, snr: 10, hopCount: 4 }), report(5, 5, { rssi: NaN, snr: Infinity })], "24h", now);
    expect(sample.snr).toBe(5);
    expect(sample.rssi).toBe(-100);
    expect(sample.hops).toBe(2);
    expect(summarizeReports([], "24h", now).snr).toBeNull();
  });
});
