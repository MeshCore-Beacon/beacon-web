import { ApiError, getNode, getNodeObservations, getNodesPage, isNotFound } from "../../api/client";
import type { Node, NodeObservation } from "../nodes/types";

export { ATLAS_KEY, ATLAS_LEGACY_KEY, ATLAS_LIMIT, atlasPinKey, parseAtlas } from "./atlas-storage";
export type { AtlasPin, AtlasRange, SavedAtlas } from "./atlas-storage";
import type { AtlasPin, AtlasRange } from "./atlas-storage";
export const REPORT_LIMIT = 200;

// Resolve by full identity after a server database reset; never adopt a different node at an old ID.
export async function loadAtlasNode(pin: AtlasPin, signal?: AbortSignal) {
  let node: Node | undefined;
  try {
    if (pin.id) node = await getNode(pin.id, signal);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  if (node?.publicKey.toLowerCase() !== pin.publicKey) {
    const page = await getNodesPage(undefined, { pubkeyPrefix: pin.publicKey, limit: 2 }, signal);
    const match = page.items.find(row => row.publicKey.toLowerCase() === pin.publicKey);
    if (!match) throw new ApiError(404, "not_found", "Atlas identity unavailable");
    node = await getNode(match.id, signal);
  }
  if (node.publicKey.toLowerCase() !== pin.publicKey) throw new Error("Atlas identity changed");
  const page = await getNodeObservations(node.id, { limit: REPORT_LIMIT }, signal);
  return { node, page };
}

const HOUR = 3_600_000;
const RANGE_HOURS: Record<AtlasRange, number> = { "24h": 24, "3d": 72 };

export interface AtlasSample {
  reports: NodeObservation[];
  since: number;
  counts: number[];
  present: boolean[];
  snrHourly: (number | null)[];
  rssiHourly: (number | null)[];
  snr: number | null;
  rssi: number | null;
  hops: number | null;
  truncated: boolean;
}

// Zero RSSI with zero SNR is the server's "no measurement" sentinel, not a reading.
const hasSignal = (row: NodeObservation) => !(row.rssi === 0 && row.snr === 0);
const finite = (value: number | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const mean = (sum: number, n: number) => (n ? sum / n : null);

export function summarizeReports(rows: NodeObservation[], range: AtlasRange, now: number, hasMore = false): AtlasSample {
  const windowSince = now - RANGE_HOURS[range] * HOUR;
  const seen = new Set<number>();
  const reports = rows
    .filter((row) => {
      if (seen.has(row.id) || !Number.isFinite(row.heardAt) || row.heardAt < windowSince) return false;
      seen.add(row.id);
      return true;
    })
    .sort((a, b) => b.heardAt - a.heardAt || b.id - a.id);
  // hasMore alone says nothing about the window; the sample is only short when the oldest loaded row is still inside it.
  const oldestLoaded = rows.reduce<number | undefined>(
    (min, row) => (Number.isFinite(row.heardAt) && (min === undefined || row.heardAt < min) ? row.heardAt : min),
    undefined,
  );
  const truncated = hasMore && oldestLoaded !== undefined && oldestLoaded > windowSince;
  const since = truncated ? Math.floor(oldestLoaded / HOUR) * HOUR : windowSince;
  const hours = Math.max(1, Math.ceil((now - since) / HOUR));
  const counts = Array<number>(hours).fill(0);
  const sums = { snr: Array<number>(hours).fill(0), rssi: Array<number>(hours).fill(0) };
  const samples = { snr: Array<number>(hours).fill(0), rssi: Array<number>(hours).fill(0) };
  const total = { snr: 0, rssi: 0, hops: 0 };
  const n = { snr: 0, rssi: 0, hops: 0 };
  for (const row of reports) {
    // A report newer than `now` (the tick snapshot) lands in the latest hour.
    const bin = Math.min(hours - 1, Math.max(0, Math.floor((row.heardAt - since) / HOUR)));
    counts[bin]!++;
    if (finite(row.hopCount)) {
      total.hops += row.hopCount;
      n.hops++;
    }
    if (!hasSignal(row)) continue;
    for (const metric of ["snr", "rssi"] as const) {
      const value = row[metric];
      if (!finite(value)) continue;
      sums[metric][bin]! += value;
      samples[metric][bin]!++;
      total[metric] += value;
      n[metric]++;
    }
  }
  const hourly = (metric: "snr" | "rssi") => counts.map((_, i) => mean(sums[metric][i]!, samples[metric][i]!));
  return {
    reports,
    since,
    counts,
    present: counts.map((count) => count > 0),
    snrHourly: hourly("snr"),
    rssiHourly: hourly("rssi"),
    snr: mean(total.snr, n.snr),
    rssi: mean(total.rssi, n.rssi),
    hops: mean(total.hops, n.hops),
    truncated,
  };
}
