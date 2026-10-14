import { ApiError, getNodesPage, getObserver, isNotFound } from "../../api/client";
import type { Observer } from "../observers/types";
import { fillActivity } from "../stats/transforms";
import type { ObserverActivity, TelemetryPoint } from "../stats/types";
import type { AtlasPin, AtlasRange } from "./atlas-storage";

export const HOUR = 3_600_000;
export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const latest = (values: (number | null)[]) => values.findLast(finite) ?? null;

export async function loadAtlasObserver(pin: AtlasPin, signal?: AbortSignal): Promise<Observer> {
  let observer: Observer | undefined;
  try { observer = await getObserver(pin.id, signal); }
  catch (error) { if (!isNotFound(error)) throw error; }
  if (pin.publicKey && observer?.publicKey?.toLowerCase() !== pin.publicKey) {
    const page = await getNodesPage(undefined, { pubkeyPrefix: pin.publicKey, limit: 2 }, signal);
    const node = page.items.find(row => row.publicKey.toLowerCase() === pin.publicKey && row.observerId);
    observer = node?.observerId ? await getObserver(node.observerId, signal) : undefined;
  }
  if (!observer || (pin.publicKey && observer.publicKey?.toLowerCase() !== pin.publicKey) || (!pin.publicKey && observer.id !== pin.id)) {
    throw new ApiError(404, "not_found", "Saved observer identity unavailable");
  }
  return observer;
}

// Keep one actual sample per hour. Missing hours remain null; no zero fill or invented readings.
export function observerTelemetrySeries(points: TelemetryPoint[], range: AtlasRange, now: number) {
  const hours = range === "3d" ? 72 : 24;
  const start = Math.floor(now / HOUR) * HOUR - (hours - 1) * HOUR;
  const fields = ["batteryMv", "uptimeSeconds", "noiseFloorDb"] as const;
  const series = { batteryMv: Array<number | null>(hours).fill(null), uptimeSeconds: Array<number | null>(hours).fill(null), noiseFloorDb: Array<number | null>(hours).fill(null) };
  for (const point of [...points].sort((a, b) => a.t - b.t)) {
    if (!finite(point.t) || point.t < start || point.t > now) continue;
    const slot = Math.floor((point.t - start) / HOUR);
    for (const field of fields) if (finite(point[field])) series[field][slot] = point[field];
  }
  return series;
}

export function observerActivitySeries(data: ObserverActivity | undefined, range: AtlasRange, now: number) {
  if (!data) return [];
  const end = finite(data.windowEnd) ? data.windowEnd : now;
  const start = end - (range === "3d" ? 72 : 24) * HOUR;
  return fillActivity(data.points.filter(p => finite(p.t) && p.t >= start && p.t <= end), HOUR, { start, end }, data);
}
