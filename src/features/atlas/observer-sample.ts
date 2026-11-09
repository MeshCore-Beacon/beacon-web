import { observerNoiseFloor } from "../observers/observer-stats";
import type { Observer } from "../observers/types";
import { hasTelemetry } from "../stats/transforms";
import type { ObserverActivity, ObserverTelemetry, TelemetryPoint } from "../stats/types";
import type { AtlasRange } from "./atlas";

// Go duration strings the observer endpoints expect, per Atlas window; one bucket per hour for both.
export const OBSERVER_RANGE: Record<AtlasRange, string> = { "24h": "24h", "3d": "72h" };
export const OBSERVER_INTERVAL = "1h";
const RANGE_HOURS: Record<AtlasRange, number> = { "24h": 24, "3d": 72 };
const HOUR = 3_600_000;

export interface PayloadShare {
  name: string;
  count: number;
}

export interface ObserverSample {
  heard: number | null;
  partial?: boolean;
  counts: (number | null)[];
  types: PayloadShare[]; // busiest first
  airtime: number | null; // percent of the window on air, TX + RX
  airtimeTx: number | null;
  airtimeRx: number | null;
  airtimeHourly: (number | null)[];
  // "radio": the device's own TX/RX counters; "heard": RX estimated from the packets it heard
  airtimeSource: "radio" | "heard" | null;
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
  // Slots count back from the tick, newest last. The tick can trail the clock by a minute, so a bucket
  // up to an hour past it lands in the newest slot; anything later is a bad clock and is dropped.
  const age = (t: number) => Math.max(0, Math.floor((now - t) / HOUR));
  const bin = (t: number) => hours - 1 - age(t);
  const inWindow = (t: number) => Number.isFinite(t) && t < now + HOUR && age(t) < hours;

  const counts = Array.from({ length: hours }, (_, i): number | null => {
    if (!activity) return null;
    const hour = Math.floor((now - (hours - 1 - i) * HOUR) / HOUR) * HOUR;
    return activity.rawFrom != null && hour < activity.rawFrom && (activity.rolledUntil == null || hour >= activity.rolledUntil) ? null : 0;
  });
  // Hours the server read but has no bucket for were quiet: on air 0% of the time.
  const heardAir = counts.map((v): number | null => (v === null ? null : 0));
  let heard: number | null = counts.some(finite) ? 0 : null;
  let heardMs = 0;
  let costed = false;
  for (const p of activity?.points ?? []) {
    if (!inWindow(p.t)) continue;
    const i = bin(p.t);
    if (!finite(p.observations)) {
      counts[i] = null;
      heardAir[i] = null;
      continue;
    }
    counts[i] = (counts[i] ?? 0) + p.observations;
    heard = (heard ?? 0) + p.observations;
    if (finite(p.airtimeMs)) {
      costed = true;
      heardMs += p.airtimeMs;
      heardAir[i] = (heardAir[i] ?? 0) + (p.airtimeMs / HOUR) * 100;
    }
  }
  const types = [...(activity?.payloadTypes ?? [])]
    .filter((p) => finite(p.count) && p.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((p) => ({ name: p.payloadTypeName, count: p.count }));

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

  // 1h telemetry points carry on-air seconds since boot: each step between readings is time on air
  // over the time between them. A counter that went backwards was a reboot, so that step counts as 0.
  let txSecs = 0;
  let rxSecs = 0;
  let spanSecs = 0;
  const radioAir = Array<number | null>(hours).fill(null);
  const counted = live.filter((p) => finite(p.airtimeTxSecs) && finite(p.airtimeRxSecs));
  for (let i = 1; i < counted.length; i++) {
    const prev = counted[i - 1]!;
    const cur = counted[i]!;
    const gap = (cur.t - prev.t) / 1000;
    if (gap <= 0) continue;
    const tx = Math.max(0, cur.airtimeTxSecs! - prev.airtimeTxSecs!);
    const rx = Math.max(0, cur.airtimeRxSecs! - prev.airtimeRxSecs!);
    txSecs += tx;
    rxSecs += rx;
    spanSecs += gap;
    radioAir[bin(cur.t)] = ((tx + rx) / gap) * 100;
  }
  const radio = spanSecs > 0;
  const readHours = heardAir.filter((v) => v !== null).length;
  const estimated = !radio && costed && readHours > 0;
  const heardShare = estimated ? (heardMs / 1000 / (readHours * 3600)) * 100 : null;

  return {
    heard,
    partial: activity !== undefined && counts.some(value => value === null),
    counts,
    types,
    airtime: radio ? ((txSecs + rxSecs) / spanSecs) * 100 : heardShare,
    airtimeTx: radio ? (txSecs / spanSecs) * 100 : null,
    airtimeRx: radio ? (rxSecs / spanSecs) * 100 : heardShare,
    airtimeHourly: radio ? radioAir : estimated ? heardAir : Array<number | null>(hours).fill(null),
    airtimeSource: radio ? "radio" : estimated ? "heard" : null,
    noiseHourly: series("noiseFloorDb"),
    // The status record's reading first, as the Observers page does; telemetry when it has none.
    noise: (observer && observerNoiseFloor(observer)) ?? latest("noiseFloorDb") ?? null,
    batteryHourly: series("batteryMv").map(volts),
    battery,
    uptime: uptime ?? null,
    uptimeHourly: series("uptimeSeconds"),
  };
}
