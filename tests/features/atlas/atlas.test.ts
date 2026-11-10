import { describe, expect, it, vi } from "vitest";
import * as api from "../../../src/api/client";
import { atlasFile, atlasFileName, parseAtlas, pinKey, readAtlasFile, resolveObserverNode, summarizeActivity, ATLAS_FILE_MAX_BYTES, ATLAS_LIMIT } from "../../../src/features/atlas/atlas";
import type { NodeActivity } from "../../../src/features/nodes/types";
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
    expect(api.getNodesPage).toHaveBeenCalledWith(undefined, { pubkey: key, limit: 2 }, undefined);
    await expect(resolveObserverNode({ publicKey: "" } as Observer)).resolves.toBeNull();
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [], hasMore: false, nextCursor: null } as never);
    await expect(resolveObserverNode({ publicKey: key } as Observer)).resolves.toBeNull();
  });
});

const pin = { id: "11111111-1111-4111-8111-111111111111", publicKey: "AB".repeat(32), name: "My repeater" };
const nodePin = { kind: "node", ...pin, publicKey: pin.publicKey.toLowerCase() };
const now = Date.UTC(2026, 8, 29, 12);
const HOUR = 3_600_000;
// The tick sits ten minutes into the hour; hour(n) is the bucket n hours back.
const tick = now + 600_000;
const hour = (n: number) => now - n * HOUR;
const point = (n: number, observations: number, extra: Partial<NodeActivity["points"][number]> = {}) => ({ t: hour(n), observations, snrAvg: null, rssiAvg: null, hopAvg: null, ...extra });
const activityOf = (extra: Partial<NodeActivity> = {}): NodeActivity => ({
  windowStart: tick - 24 * HOUR, windowEnd: tick, generatedAt: tick, range: "24h",
  summary: { observations: 0, snrAvg: null, rssiAvg: null, hopAvg: null }, points: [], latest: null, ...extra,
});

describe("saved Atlas", () => {
  it("restores valid ordered full identities, normalizes keys and removes duplicates", () => {
    const pins = [{ kind: "node", ...pin }, nodePin, { ...nodePin, publicKey: "cd".repeat(32) }];
    expect(parseAtlas(JSON.stringify({ version: 2, range: "3d", pins }))).toEqual({ version: 2, range: "3d", pins: [nodePin, { ...nodePin, publicKey: "cd".repeat(32) }] });
  });
  it("tolerates unavailable, corrupt, old and future storage, rejects partial keys and caps the collection", () => {
    const old = JSON.stringify({ version: 1, range: "3d", nodes: [pin] });
    for (const value of [null, "{", "[]", '{"version":3}', old, '{"version":2,"pins":{}}']) expect(parseAtlas(value).pins).toEqual([]);
    const pins = [{ ...nodePin, publicKey: "abcd" }, { ...nodePin, id: "../unsafe" }, ...Array.from({ length: 20 }, (_, i) => ({ ...nodePin, publicKey: i.toString(16).padStart(64, "0") }))];
    const result = parseAtlas(JSON.stringify({ version: 2, range: "30d", pins }));
    expect(result.pins).toHaveLength(ATLAS_LIMIT);
    expect(result.range).toBe("24h");
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

describe("node activity sample", () => {
  it("bins the hourly points newest last and takes totals and means from the server summary", () => {
    const latest = { packetHash: "ef".repeat(32), heardAt: tick - 1000 };
    const sample = summarizeActivity(activityOf({
      summary: { observations: 50, snrAvg: 5, rssiAvg: -100, hopAvg: 2 },
      points: [point(24, 9, { snrAvg: 20 }), point(2, 7), point(0, 3, { snrAvg: 4, rssiAvg: -90, hopAvg: 1 })],
      latest,
    }), "24h", tick);
    expect(sample.counts).toHaveLength(24);
    expect(sample.counts[23]).toBe(3);
    expect(sample.counts[22]).toBe(0);
    expect(sample.counts[21]).toBe(7);
    expect(sample.counts.reduce<number>((a, b) => a + (b ?? 0), 0)).toBe(10);
    expect(sample.present.filter(Boolean)).toHaveLength(2);
    expect(sample.snrHourly[23]).toBe(4);
    expect(sample.rssiHourly[23]).toBe(-90);
    expect(sample.snrHourly[21]).toBeNull();
    expect(sample.snrHourly[0]).toBeNull();
    expect(sample).toMatchObject({ total: 50, snr: 5, rssi: -100, hops: 2, partial: false, latest });
  });

  it("keeps a real zero mean and turns missing or non-finite means into null", () => {
    const sample = summarizeActivity(activityOf({ summary: { observations: 4, snrAvg: 0, rssiAvg: null, hopAvg: NaN }, points: [point(1, 4, { snrAvg: 0 })] }), "24h", tick);
    expect(sample.snr).toBe(0);
    expect(sample.snrHourly[22]).toBe(0);
    expect(sample.rssi).toBeNull();
    expect(sample.hops).toBeNull();
  });

  it("marks hours that are neither rolled up nor in the raw tail as unknown, not quiet", () => {
    const sample = summarizeActivity(activityOf({ rolledUntil: hour(10), rawFrom: hour(4), points: [point(12, 2), point(1, 1)] }), "24h", tick);
    expect(sample.counts[23 - 12]).toBe(2);
    expect(sample.counts[23 - 11]).toBe(0);
    expect(sample.counts.slice(23 - 10, 23 - 4)).toEqual(Array(6).fill(null));
    expect(sample.counts[23 - 4]).toBe(0);
    expect(sample.present[23 - 7]).toBe(false);
    expect(sample.partial).toBe(true);
    const rawOnly = summarizeActivity(activityOf({ rawFrom: hour(4) }), "24h", tick);
    expect(rawOnly.counts.filter((v) => v === null)).toHaveLength(19);
  });

  it("is all unknown with dashes for totals until the activity has loaded", () => {
    const sample = summarizeActivity(undefined, "3d", tick);
    expect(sample.counts).toEqual(Array(72).fill(null));
    expect(sample.present).toHaveLength(72);
    expect(sample).toMatchObject({ total: null, snr: null, rssi: null, hops: null, latest: null, partial: false });
    expect(summarizeActivity(activityOf(), "3d", tick).counts).toEqual(Array(72).fill(0));
  });
});

describe("Atlas export file", () => {
  const nodePin = { kind: "node" as const, id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "Hill" };
  const observerPin = { kind: "observer" as const, observerId: "33333333-3333-4333-8333-333333333333", name: "Roof" };
  const saved = { version: 2 as const, range: "3d" as const, pins: [nodePin, observerPin] };

  it("round-trips the pins, order and range with a format tag", () => {
    const text = atlasFile(saved, 1_800_000_000_000);
    expect(JSON.parse(text)).toMatchObject({ format: "beacon-atlas", version: 2, exportedAt: 1_800_000_000_000 });
    expect(readAtlasFile(text)).toEqual({ atlas: saved, skipped: 0 });
  });

  it("names the file by UTC date", () => {
    expect(atlasFileName(new Date(Date.UTC(2026, 10, 5, 23, 0)))).toBe("beacon-atlas-2026-11-05.json");
  });

  it("rejects text that is not an Atlas export", () => {
    expect(readAtlasFile("not json")).toBeNull();
    expect(readAtlasFile(JSON.stringify({ version: 2, pins: [nodePin] }))).toBeNull();
    expect(readAtlasFile(JSON.stringify({ format: "beacon-atlas", pins: "x" }))).toBeNull();
    expect(readAtlasFile(" ".repeat(ATLAS_FILE_MAX_BYTES + 1))).toBeNull();
  });

  it("drops invalid and duplicate pins and caps the rest, counting what it skipped", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ ...nodePin, id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`, publicKey: i.toString(16).padStart(2, "0").repeat(32) }));
    const result = readAtlasFile(JSON.stringify({ format: "beacon-atlas", version: 2, range: "24h", pins: [{ kind: "node", id: "bad" }, many[0], many[0], ...many.slice(1)] }));
    expect(result!.atlas.pins).toHaveLength(12);
    expect(result!.skipped).toBe(4);
  });
});
