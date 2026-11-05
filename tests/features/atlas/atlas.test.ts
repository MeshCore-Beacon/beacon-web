import { describe, expect, it, vi } from "vitest";
import * as api from "../../../src/api/client";
import { parseAtlas, pinKey, resolveObserverNode, summarizeReports, ATLAS_LIMIT } from "../../../src/features/atlas/atlas";
import type { NodeObservation } from "../../../src/features/nodes/types";
import type { Observer } from "../../../src/features/observers/types";

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getNodesPage: vi.fn(),
}));

describe("resolveObserverNode", () => {
  it("resolves an observer to the node with the same key and to nothing otherwise", async () => {
    const key = "ab".repeat(32);
    const node = { id: "11111111-1111-4111-8111-111111111111", publicKey: key.toUpperCase(), name: "R1" };
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [{ ...node, publicKey: "ab".repeat(31) + "ff" }, node], hasMore: false, nextCursor: null } as never);
    await expect(resolveObserverNode({ publicKey: key } as Observer)).resolves.toMatchObject({ id: node.id });
    expect(api.getNodesPage).toHaveBeenCalledWith(undefined, { pubkeyPrefix: key, limit: 2 }, undefined);
    await expect(resolveObserverNode({ publicKey: "" } as Observer)).resolves.toBeNull();
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [], hasMore: false, nextCursor: null } as never);
    await expect(resolveObserverNode({ publicKey: key } as Observer)).resolves.toBeNull();
  });
});

const pin = { id: "11111111-1111-4111-8111-111111111111", publicKey: "AB".repeat(32), name: "My repeater" };
const nodePin = { kind: "node", ...pin, publicKey: pin.publicKey.toLowerCase() };
const now = Date.UTC(2026, 8, 29, 12);
const report = (id: number, hours: number, extra: Partial<NodeObservation> = {}): NodeObservation => ({ id, packetHash: String(id).padStart(64, "0"), payloadType: 4, payloadTypeName: "ADVERT", iata: "YKF", heardAt: now - hours * 3_600_000, ...extra });

describe("saved Atlas", () => {
  it("restores valid ordered full identities, normalizes keys and removes duplicates", () => {
    expect(parseAtlas(JSON.stringify({ version: 1, range: "3d", nodes: [pin, { ...pin, publicKey: pin.publicKey.toLowerCase() }, { ...pin, publicKey: "cd".repeat(32) }] }))).toEqual({ version: 2, range: "3d", pins: [nodePin, { ...nodePin, publicKey: "cd".repeat(32) }] });
  });
  it("tolerates unavailable, corrupt and future storage, rejects partial keys and caps the collection", () => {
    for (const value of [null, "{", "[]", '{"version":3}', '{"version":1,"nodes":null}', '{"version":2,"pins":{}}']) expect(parseAtlas(value).pins).toEqual([]);
    const nodes = [{ ...pin, publicKey: "abcd" }, { ...pin, id: "../unsafe" }, ...Array.from({ length: 20 }, (_, i) => ({ ...pin, publicKey: i.toString(16).padStart(64, "0") }))];
    const result = parseAtlas(JSON.stringify({ version: 1, range: "30d", nodes }));
    expect(result.pins).toHaveLength(ATLAS_LIMIT);
    expect(result.range).toBe("24h");
  });
  it("migrates a version 1 collection to node pins in order and keeps the range", () => {
    const raw = JSON.stringify({ version: 1, range: "3d", nodes: [
      { id: "11111111-1111-4111-8111-111111111111", publicKey: "AB".repeat(32), name: "One" },
      { id: "22222222-2222-4222-8222-222222222222", publicKey: "cd".repeat(32), name: "Two" },
    ] });
    expect(parseAtlas(raw)).toEqual({ version: 2, range: "3d", pins: [
      { kind: "node", id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "One" },
      { kind: "node", id: "22222222-2222-4222-8222-222222222222", publicKey: "cd".repeat(32), name: "Two" },
    ] });
  });
  it("round-trips version 2 pins of both kinds, keeps the observer hint, and drops unknown kinds", () => {
    const pins = [
      { kind: "node", id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "One", observerId: "33333333-3333-4333-8333-333333333333" },
      { kind: "observer", observerId: "44444444-4444-4444-8444-444444444444", name: "Listener" },
      { kind: "channel", id: "x", name: "Nope" },
      { kind: "observer", observerId: "not-a-uuid", name: "Bad" },
      { kind: "node", id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "Twin", observerId: "bad" },
    ];
    expect(parseAtlas(JSON.stringify({ version: 2, range: "24h", pins }))).toEqual({ version: 2, range: "24h", pins: [pins[0], pins[1]] });
    expect(pinKey(pins[0] as never)).toBe("ab".repeat(32));
    expect(pinKey(pins[1] as never)).toBe("44444444-4444-4444-8444-444444444444");
  });
  it("dedupes observer pins by id and caps both kinds together at the limit", () => {
    const observer = (n: number) => ({ kind: "observer", observerId: `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`, name: `L${n}` });
    const pins = [observer(1), observer(1), ...Array.from({ length: 14 }, (_, i) => observer(i + 2))];
    expect(parseAtlas(JSON.stringify({ version: 2, range: "24h", pins })).pins).toHaveLength(ATLAS_LIMIT);
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
