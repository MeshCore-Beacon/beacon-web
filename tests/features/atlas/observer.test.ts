import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../src/api/client";
import { ATLAS_KEY, ATLAS_LEGACY_KEY, atlasPinKey, parseAtlas } from "../../../src/features/atlas/atlas-storage";
import { HOUR, loadAtlasObserver, observerActivitySeries, observerTelemetrySeries } from "../../../src/features/atlas/observer";
import type { Observer } from "../../../src/features/observers/types";
import type { ObserverActivity, TelemetryPoint } from "../../../src/features/stats/types";

const id = "11111111-1111-4111-8111-111111111111";
const key = "ab".repeat(32);
const pin = { id, publicKey: key, name: "Home", kind: "observer" as const };
afterEach(() => vi.restoreAllMocks());

describe("mixed saved Atlas", () => {
  it("migrates v1 node order into a separate v2 key, including pending preview identities", () => {
    expect(ATLAS_KEY).not.toBe(ATLAS_LEGACY_KEY);
    const original = { version: 1, range: "3d", nodes: [{ ...pin, kind: undefined }, { id: "", name: "Pending", publicKey: "cd".repeat(32) }] };
    const saved = parseAtlas(JSON.stringify({ ...original, nodes: [null, ...original.nodes, 7] }));
    expect(saved).toEqual({ version: 2, range: "3d", cards: original.nodes.map(p => ({ ...p, kind: "node" })) });
  });
  it("allows node and observer views of one identity but deduplicates each kind", () => {
    const saved = parseAtlas(JSON.stringify({ version: 2, cards: [{ ...pin, kind: "node" }, pin, { ...pin, publicKey: key.toUpperCase() }, { ...pin, kind: "other" }, { ...pin, id: "" }] }));
    expect(saved.cards).toHaveLength(2);
    expect(atlasPinKey(saved.cards[0]!)).not.toBe(atlasPinKey(saved.cards[1]!));
  });
  it("supports UUID-only observers, but rejects partial keys and nil observer IDs", () => {
    const saved = parseAtlas(JSON.stringify({ version: 2, cards: [{ ...pin, publicKey: "" }, { ...pin, publicKey: "ab" }, { ...pin, id: "00000000-0000-0000-0000-000000000000" }] }));
    expect(saved.cards).toEqual([{ ...pin, publicKey: "" }]);
  });
});

describe("observer identity and history", () => {
  it("does not adopt a different observer when a saved UUID changes identity", async () => {
    vi.spyOn(api, "getObserver").mockResolvedValue({ id, publicKey: "ff".repeat(32) } as Observer);
    vi.spyOn(api, "getNodesPage").mockResolvedValue({ items: [], hasMore: false });
    await expect(loadAtlasObserver(pin)).rejects.toMatchObject({ status: 404 });
  });
  it("relocates only through the same full public key and validates the final observer", async () => {
    const next = "22222222-2222-4222-8222-222222222222";
    vi.spyOn(api, "getObserver").mockRejectedValueOnce(new api.ApiError(404, "not_found", "gone")).mockResolvedValueOnce({ id: next, publicKey: key } as Observer);
    vi.spyOn(api, "getNodesPage").mockResolvedValue({ items: [{ publicKey: key, observerId: next }] as never, hasMore: false });
    expect((await loadAtlasObserver(pin)).id).toBe(next);
  });
  it("keeps zero, missing hours, and uptime resets distinct and excludes future samples", () => {
    const now = 30 * HOUR;
    const point = (t: number, value: number | null) => ({ t, batteryMv: value, noiseFloorDb: value, uptimeSeconds: value } as TelemetryPoint);
    const series = observerTelemetrySeries([point(now - 2 * HOUR, 4000), point(now, 0), point(now + HOUR, 9999), point(now - 1, null)], "24h", now);
    expect(series.batteryMv.slice(-3)).toEqual([4000, null, 0]);
    expect(series.uptimeSeconds.slice(-3)).toEqual([4000, null, 0]);
    expect(observerTelemetrySeries([], "3d", now).batteryMv).toHaveLength(72);
  });
  it("retains unread activity hours as unknown rather than a measured zero", () => {
    const end = 30 * HOUR;
    const rows = observerActivitySeries({ windowEnd: end, range: "24h", interval: "1h", points: [], rawFrom: end - HOUR } as unknown as ObserverActivity, "24h", end);
    expect(rows.find(p => p.t === end - 2 * HOUR)?.observations).toBeNull();
    expect(rows.find(p => p.t === end)?.observations).toBe(0);
  });
});
