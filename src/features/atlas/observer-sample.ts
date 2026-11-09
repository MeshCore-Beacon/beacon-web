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
}

export function summarizeObserver(
  activity: ObserverActivity | undefined,
  telemetry: ObserverTelemetry | undefined,
  observer: Observer | undefined,
  range: AtlasRange,
  now: number,
): ObserverSample {
  const hours = RANGE_HOURS[range];
  // Slots count back from the tick, newest last; a bucket newer than the tick lands in the newest slot.
  const age = (t: number) => Math.max(0, Math.floor((now - t) / HOUR));
  const bin = (t: number) => hours - 1 - age(t);
  const inWindow = (t: number) => Number.isFinite(t) && age(t) < hours;

  // The server skips quiet hours, so an hour with no bucket heard nothing; a null bucket was never read.
  let heard: number | null = null;
  let heardMs = 0;
  let costed = false;
  const heardHourly = Array<number | null>(hours).fill(0);
  for (const p of activity?.points ?? []) {
    if (!inWindow(p.t)) continue;
    const i = bin(p.t);
    if (p.observations === null) {
      heardHourly[i] = null;
      continue;
    }
    heard = (heard ?? 0) + p.observations;
    if (p.airtimeMs !== null) {
      costed = true;
      heardMs += p.airtimeMs;
      heardHourly[i] = (heardHourly[i] ?? 0) + (p.airtimeMs / HOUR) * 100;
    }
  }
  const readHours = heardHourly.filter((v) => v !== null).length;
  const types = [...(activity?.payloadTypes ?? [])]
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((p) => ({ name: p.payloadTypeName, count: p.count }));

  // A stray all-zero status row is "no reading", not a 0 dB floor or an empty battery.
  const live = (telemetry?.points ?? []).filter((p) => inWindow(p.t) && hasTelemetry([p])).sort((a, b) => a.t - b.t);
  const series = (key: keyof TelemetryPoint) => {
    const out = Array<number | null>(hours).fill(null);
    for (const p of live) if (p[key] !== null) out[bin(p.t)] = p[key];
    return out;
  };
  const latest = (key: keyof TelemetryPoint) => [...live].reverse().find((p) => p[key] !== null)?.[key];
  // Mains-powered observers report 0 mV; a battery never reads zero, so that is "no battery".
  const volts = (mv: number | null | undefined) => (mv ? mv / 1000 : null);
  const uptime = observer?.uptimeSeconds ?? latest("uptimeSeconds");

  // 1h telemetry points carry on-air seconds since boot: each step between readings is time on air
  // over the time between them. A counter that went backwards was a reboot, so that step counts as 0.
  let txSecs = 0;
  let rxSecs = 0;
  let spanSecs = 0;
  const radioHourly = Array<number | null>(hours).fill(null);
  const counted = live.filter((p) => p.airtimeTxSecs !== null && p.airtimeRxSecs !== null);
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
    radioHourly[bin(cur.t)] = ((tx + rx) / gap) * 100;
  }
  const share = (secs: number, span: number) => (secs / span) * 100;
  const radio = spanSecs > 0;
  const estimated = !radio && costed && readHours > 0;
  const heardShare = estimated ? share(heardMs / 1000, readHours * 3600) : null;

  return {
    heard,
    types,
    airtime: radio ? share(txSecs + rxSecs, spanSecs) : heardShare,
    airtimeTx: radio ? share(txSecs, spanSecs) : null,
    airtimeRx: radio ? share(rxSecs, spanSecs) : heardShare,
    airtimeHourly: radio ? radioHourly : estimated ? heardHourly : Array<number | null>(hours).fill(null),
    airtimeSource: radio ? "radio" : estimated ? "heard" : null,
    noiseHourly: series("noiseFloorDb"),
    noise: latest("noiseFloorDb") ?? null,
    batteryHourly: series("batteryMv").map(volts),
    battery: volts(latest("batteryMv")),
    uptime: uptime ?? null,
  };
}
