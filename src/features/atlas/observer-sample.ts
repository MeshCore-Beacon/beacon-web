import type { Observer } from "../observers/types";
import { hasTelemetry } from "../stats/transforms";
import type { ObserverActivity, ObserverTelemetry, TelemetryPoint } from "../stats/types";
import type { AtlasRange } from "./atlas";

// Go duration strings the observer endpoints expect, per Atlas window; one bucket per hour for both.
export const OBSERVER_RANGE: Record<AtlasRange, string> = { "24h": "24h", "3d": "72h" };
export const OBSERVER_INTERVAL = "1h";
const RANGE_HOURS: Record<AtlasRange, number> = { "24h": 24, "3d": 72 };
const HOUR = 3_600_000;

export interface ObserverSample {
  heard: number | null;
  partial?: boolean;
  counts: (number | null)[];
  snrHourly: (number | null)[];
  snr: number | null;
  noiseHourly: (number | null)[];
  noise: number | null;
  batteryHourly: (number | null)[];
  battery: number | null;
  uptime: number | null;
  uptimeHourly: (number | null)[];
}

export function summarizeObserver(
  activity: ObserverActivity | undefined,
  telemetry: ObserverTelemetry | undefined,
  observer: Observer | undefined,
  range: AtlasRange,
  now: number,
): ObserverSample {
  const hours = RANGE_HOURS[range];
  const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  // Slots count back from the tick, newest last; a bucket newer than the tick lands in the newest slot.
  const age = (t: number) => Math.max(0, Math.floor((now - t) / HOUR));
  const bin = (t: number) => hours - 1 - age(t);
  const inWindow = (t: number) => Number.isFinite(t) && t <= now && age(t) < hours;

  const counts = Array.from({ length: hours }, (_, i): number | null => {
    if (!activity) return null;
    const hour = Math.floor((now - (hours - 1 - i) * HOUR) / HOUR) * HOUR;
    return activity.rawFrom != null && hour < activity.rawFrom && (activity.rolledUntil == null || hour >= activity.rolledUntil) ? null : 0;
  });
  const snrHourly = Array<number | null>(hours).fill(null);
  let heard: number | null = counts.some(finite) ? 0 : null;
  let weighted = 0;
  let weight = 0;
  for (const p of activity?.points ?? []) {
    if (!inWindow(p.t)) continue;
    const i = bin(p.t);
    if (!finite(p.observations)) {
      counts[i] = null;
      continue;
    }
    counts[i] = (counts[i] ?? 0) + p.observations;
    heard = (heard ?? 0) + p.observations;
    if (finite(p.snrAvg) && p.observations > 0) {
      snrHourly[i] = p.snrAvg;
      weighted += p.snrAvg * p.observations;
      weight += p.observations;
    }
  }

  // A stray all-zero status row is "no reading", not a 0 dB floor or an empty battery.
  const live = (telemetry?.points ?? []).filter((p) => inWindow(p.t) && hasTelemetry([p])).sort((a, b) => a.t - b.t);
  const series = (key: keyof TelemetryPoint) => {
    const out = Array<number | null>(hours).fill(null);
    for (const p of live) if (finite(p[key])) out[bin(p.t)] = p[key];
    return out;
  };
  const latest = (key: keyof TelemetryPoint) => [...live].reverse().find((p) => finite(p[key]))?.[key];
  // Mains-powered observers report 0 mV; a battery never reads zero, so that is "no battery".
  const volts = (mv: number | null | undefined) => (finite(mv) && mv > 0 ? mv / 1000 : null);
  const battery = observer?.batteryLevel == null ? volts(latest("batteryMv")) : finite(observer.batteryLevel) && observer.batteryLevel > 0 ? observer.batteryLevel : null;
  const uptime = finite(observer?.uptimeSeconds) ? observer.uptimeSeconds : latest("uptimeSeconds");

  return {
    heard,
    partial: activity !== undefined && counts.some(value => value === null),
    counts,
    snrHourly,
    snr: weight ? weighted / weight : null,
    noiseHourly: series("noiseFloorDb"),
    noise: latest("noiseFloorDb") ?? null,
    batteryHourly: series("batteryMv").map(volts),
    battery,
    uptime: uptime ?? null,
    uptimeHourly: series("uptimeSeconds"),
  };
}
