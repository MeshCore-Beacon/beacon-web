import { ApiError, getNode, getNodesPage, isNotFound } from "../../api/client";
import type { Node, NodeActivity, NodeSummary } from "../nodes/types";
import type { Observer } from "../observers/types";

export const ATLAS_KEY = "beacon-atlas-v2";
export const ATLAS_LIMIT = 12;
export type AtlasRange = "24h" | "3d";
export interface NodePin { kind: "node"; id: string; publicKey: string; name: string; observerId?: string }
export interface ObserverPin { kind: "observer"; observerId: string; name: string }
export type AtlasPin = NodePin | ObserverPin;
export interface SavedAtlas { version: 2; range: AtlasRange; pins: AtlasPin[] }

const UUID = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const KEY = /^[\da-f]{64}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export const pinKey = (pin: AtlasPin) => (pin.kind === "node" ? pin.publicKey : pin.observerId);

// Only a version 2 payload loads; anything else is empty.
export function parseAtlas(raw: string | null): SavedAtlas {
  const empty: SavedAtlas = { version: 2, range: "24h", pins: [] };
  try {
    if (!raw || raw.length > 32_000) return empty;
    const value = JSON.parse(raw);
    const list = value?.version === 2 ? value.pins : null;
    if (!Array.isArray(list)) return empty;
    const pins: AtlasPin[] = [];
    for (const entry of list) {
      const pin = toPin(entry);
      if (!pin || pins.some((other) => pinKey(other) === pinKey(pin))) continue;
      pins.push(pin);
      if (pins.length === ATLAS_LIMIT) break;
    }
    return { version: 2, range: value.range === "3d" ? "3d" : "24h", pins };
  } catch { return empty; }
}

// The export file is the saved Atlas plus a format tag. Web and app read and write the same file.
export const ATLAS_FILE_FORMAT = "beacon-atlas";
export const ATLAS_FILE_MAX_BYTES = 256_000;

export function atlasFile(saved: SavedAtlas, now = Date.now()): string {
  return JSON.stringify({ format: ATLAS_FILE_FORMAT, version: 2, exportedAt: now, range: saved.range, pins: saved.pins }, null, 2);
}

export const atlasFileName = (now = new Date()) => `beacon-atlas-${now.toISOString().slice(0, 10)}.json`;

export interface AtlasImport { atlas: SavedAtlas; skipped: number }

// null when the text is not an Atlas export. Pins go through the same checks, dedupe and cap as a restore.
export function readAtlasFile(text: string): AtlasImport | null {
  if (text.length > ATLAS_FILE_MAX_BYTES) return null;
  let value: { format?: unknown; pins?: unknown };
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || value.format !== ATLAS_FILE_FORMAT || !Array.isArray(value.pins)) return null;
  const atlas = parseAtlas(JSON.stringify(value));
  return { atlas, skipped: value.pins.length - atlas.pins.length };
}

function toPin(raw: unknown): AtlasPin | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name.slice(0, 160) : "";
  const kind = value.kind;
  if (kind === "observer") return isUuid(value.observerId) ? { kind, observerId: value.observerId, name } : null;
  if (kind !== "node" || !isUuid(value.id) || typeof value.publicKey !== "string" || !KEY.test(value.publicKey)) return null;
  const pin: NodePin = { kind, id: value.id, publicKey: value.publicKey.toLowerCase(), name };
  if (isUuid(value.observerId)) pin.observerId = value.observerId;
  return pin;
}

// The same radio can be a node and an observer; when it advertises, the node is the pin.
export async function resolveObserverNode(observer: Observer, signal?: AbortSignal): Promise<NodeSummary | null> {
  const key = observer.publicKey?.toLowerCase();
  if (!key) return null;
  const page = await getNodesPage(undefined, { pubkey: key, limit: 2 }, signal);
  return page.items.find((row) => row.publicKey.toLowerCase() === key) ?? null;
}

// Resolve by full identity after a server database reset; never adopt a different node at an old ID.
export async function loadAtlasNode(pin: NodePin, signal?: AbortSignal): Promise<Node> {
  let node: Node | undefined;
  try {
    node = await getNode(pin.id, signal);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  if (node?.publicKey.toLowerCase() !== pin.publicKey) {
    const page = await getNodesPage(undefined, { pubkey: pin.publicKey, limit: 2 }, signal);
    const match = page.items.find(row => row.publicKey.toLowerCase() === pin.publicKey);
    if (!match) throw new ApiError(404, "not_found", "Atlas identity unavailable");
    node = await getNode(match.id, signal);
  }
  if (node.publicKey.toLowerCase() !== pin.publicKey) throw new Error("Atlas identity changed");
  return node;
}

export const HOUR = 3_600_000;
const RANGE_HOURS: Record<AtlasRange, number> = { "24h": 24, "3d": 72 };
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// Slots count back from the tick, newest last. The tick can trail the clock by a minute, so a bucket
// up to an hour past it lands in the newest slot; anything later is a bad clock and is dropped.
export function hourSlots(range: AtlasRange, now: number) {
  const hours = RANGE_HOURS[range];
  const age = (t: number) => Math.max(0, Math.floor((now - t) / HOUR));
  return {
    hours,
    bin: (t: number) => hours - 1 - age(t),
    inWindow: (t: number) => Number.isFinite(t) && t < now + HOUR && age(t) < hours,
    // Zero for an hour the server read, null for one it has not: no reply yet, or between the rollups and the raw tail.
    counts: (read: { rolledUntil?: number; rawFrom?: number } | undefined) =>
      Array.from({ length: hours }, (_, i): number | null => {
        if (!read) return null;
        const hour = Math.floor((now - (hours - 1 - i) * HOUR) / HOUR) * HOUR;
        return read.rawFrom != null && hour < read.rawFrom && (read.rolledUntil == null || hour >= read.rolledUntil) ? null : 0;
      }),
  };
}

export interface AtlasSample {
  total: number | null;
  partial: boolean;
  counts: (number | null)[];
  present: boolean[];
  snrHourly: (number | null)[];
  rssiHourly: (number | null)[];
  snr: number | null;
  rssi: number | null;
  hops: number | null;
  latest: NodeActivity["latest"];
}

// Totals and means are the server's (sum over samples); averaging the hourly means here would skew them.
export function summarizeActivity(activity: NodeActivity | undefined, range: AtlasRange, now: number): AtlasSample {
  const slots = hourSlots(range, now);
  const counts = slots.counts(activity);
  const snrHourly = Array<number | null>(slots.hours).fill(null);
  const rssiHourly = Array<number | null>(slots.hours).fill(null);
  for (const p of activity?.points ?? []) {
    if (!slots.inWindow(p.t)) continue;
    const i = slots.bin(p.t);
    if (!finite(p.observations)) {
      counts[i] = null;
      continue;
    }
    counts[i] = (counts[i] ?? 0) + p.observations;
    if (finite(p.snrAvg)) snrHourly[i] = p.snrAvg;
    if (finite(p.rssiAvg)) rssiHourly[i] = p.rssiAvg;
  }
  const summary = activity?.summary;
  const mean = (value: unknown) => (finite(value) ? value : null);
  return {
    total: mean(summary?.observations),
    partial: activity !== undefined && counts.some((value) => value === null),
    counts,
    present: counts.map((count) => (count ?? 0) > 0),
    snrHourly,
    rssiHourly,
    snr: mean(summary?.snrAvg),
    rssi: mean(summary?.rssiAvg),
    hops: mean(summary?.hopAvg),
    latest: activity?.latest?.packetHash ? activity.latest : null,
  };
}
