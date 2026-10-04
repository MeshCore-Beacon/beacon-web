import { getNode, getNodeObservations, getNodesPage } from "../../api/client";
import type { Node, NodeObservation } from "../nodes/types";

export const ATLAS_KEY = "beacon-my-atlas-v1";
export const ATLAS_LIMIT = 12;
export const REPORT_LIMIT = 200;
export type AtlasRange = "24h" | "3d";
export interface AtlasPin { id: string; publicKey: string; name: string }
export interface SavedAtlas { version: 1; range: AtlasRange; nodes: AtlasPin[] }

export function parseAtlas(raw: string | null): SavedAtlas {
  const empty: SavedAtlas = { version: 1, range: "24h", nodes: [] };
  try {
    if (!raw || raw.length > 32_000) return empty;
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.nodes)) return empty;
    const nodes: AtlasPin[] = [];
    for (const pin of value.nodes) {
      if (typeof pin?.id !== "string" || (pin.id !== "" && !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(pin.id)) ||
          typeof pin.publicKey !== "string" || !/^[\da-f]{64}$/i.test(pin.publicKey)) continue;
      const publicKey = pin.publicKey.toLowerCase();
      if (nodes.some(node => node.publicKey === publicKey)) continue;
      nodes.push({ id: pin.id, publicKey, name: typeof pin.name === "string" ? pin.name.slice(0, 160) : "" });
      if (nodes.length === ATLAS_LIMIT) break;
    }
    return { version: 1, range: value.range === "3d" ? "3d" : "24h", nodes };
  } catch { return empty; }
}

// Resolve by full identity after a server database reset; never adopt a different node at an old ID.
export async function loadAtlasNode(pin: AtlasPin, signal?: AbortSignal) {
  let node: Node | undefined;
  try { if (pin.id) node = await getNode(pin.id, signal); }
  catch (error) { if (!(error instanceof Error && "status" in error && error.status === 404)) throw error; }
  if (node?.publicKey.toLowerCase() !== pin.publicKey) {
    const page = await getNodesPage(undefined, { pubkeyPrefix: pin.publicKey, limit: 2 }, signal);
    const match = page.items.find(row => row.publicKey.toLowerCase() === pin.publicKey);
    if (!match) {
      if (!node) return { node: undefined, page: { items: [], hasMore: false, nextCursor: null } };
      throw new Error("Atlas identity unavailable");
    }
    node = await getNode(match.id, signal);
  }
  if (node.publicKey.toLowerCase() !== pin.publicKey) throw new Error("Atlas identity changed");
  const page = await getNodeObservations(node.id, { limit: REPORT_LIMIT }, signal);
  return { node, page };
}

export function summarizeReports(rows: NodeObservation[], range: AtlasRange, now: number) {
  const hours = range === "3d" ? 72 : 24;
  const since = now - hours * 3_600_000;
  const seen = new Set<number>();
  const reports = rows.filter(row => {
    if (seen.has(row.id) || row.heardAt <= since || row.heardAt > now) return false;
    seen.add(row.id);
    return Number.isFinite(row.heardAt);
  }).sort((a, b) => b.heardAt - a.heardAt || b.id - a.id);
  const bins = Array<number>(hours).fill(0);
  for (const row of reports) {
    const index = Math.min(hours - 1, Math.floor((row.heardAt - since) / 3_600_000));
    bins[index] = (bins[index] ?? 0) + 1;
  }
  const signal = reports.filter(row => !(row.rssi === 0 && row.snr === 0));
  const mean = (values: (number | undefined)[]) => {
    const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  };
  const hourly = (field: "snr"|"rssi") => bins.map((_,i) => mean(signal.filter(r=>r.heardAt >= since+i*3_600_000 && r.heardAt < since+(i+1)*3_600_000).map(r=>r[field])));
  return { reports, bins, since, snrBins:hourly("snr"), rssiBins:hourly("rssi"), snr: mean(signal.map(row => row.snr)), rssi: mean(signal.map(row => row.rssi)), hops: mean(reports.map(row => row.hopCount)) };
}
