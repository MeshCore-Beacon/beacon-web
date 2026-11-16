import type { NodeTelemetry, NodeTelemetryPoint, NodeTelemetryRange } from "../nodes/types";
import { airtimePct } from "../nodes/telemetry";
import { HOUR, type AtlasRange } from "./atlas";

// The route to ask per card range. 3d is a 72h read where the server offers it (features.atlasTelemetry);
// older servers only know 168h, which is trimmed to the window here.
export function telemetryRange(range: AtlasRange, atlasTelemetry: boolean): NodeTelemetryRange {
  return range === "24h" ? "24h" : atlasTelemetry ? "72h" : "168h";
}
const WINDOW_HOURS: Record<AtlasRange, number> = { "24h": 24, "3d": 72 };

// With fewer readings than this a line looks broken, so the points are drawn as dots.
export const DOT_LIMIT = 8;

export interface TelemetrySeries {
  latest: number | null;
  // One value per reading that carried this metric, oldest first.
  values: number[];
}

export interface TelemetrySample {
  battery: TelemetrySeries;
  noise: TelemetrySeries;
  uptime: TelemetrySeries;
  temperature: TelemetrySeries;
  airtime: TelemetrySeries; // TX + RX, percent of time
  airtimeTx: number | null;
  airtimeRx: number | null;
  packets: TelemetrySeries; // received per hour
  packetsSent: number | null; // per hour, at the same reading as `packets.latest`
  signal: TelemetrySeries; // SNR, dB
  rssi: number | null;
  errors: TelemetrySeries; // receive errors per hour
  rebooted: boolean; // uptime fell somewhere in the window
  readings: number; // points in the window, whatever they carry
  latestAt: number | null; // newest reading in the window, epoch ms
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// Counter increases cover `counterSpanSecs`, not the bucket, so a rate divides by that span.
function perHour(count: number | undefined, span: number | undefined): number | null {
  if (!finite(count) || !finite(span) || span <= 0) return null;
  return (count * 3600) / span;
}

function series(points: NodeTelemetryPoint[], pick: (p: NodeTelemetryPoint) => number | null | undefined): TelemetrySeries {
  const values = points.map(pick).filter(finite);
  return { latest: values.at(-1) ?? null, values };
}

export function summarizeTelemetry(data: NodeTelemetry | undefined, range: AtlasRange, now: number): TelemetrySample {
  const from = now - WINDOW_HOURS[range] * HOUR;
  const points = (data?.points ?? []).filter((p) => finite(p.t) && p.t >= from && p.t <= now + HOUR).sort((a, b) => a.t - b.t);
  const air = points.map((p) => {
    const tx = airtimePct(p.airtimeTxSecs, p.counterSpanSecs);
    const rx = airtimePct(p.airtimeRxSecs, p.counterSpanSecs);
    return { tx, rx, total: tx !== null && rx !== null ? tx + rx : null };
  });
  const lastAir = [...air].reverse().find((a) => a.total !== null);
  const lastPackets = [...points].reverse().find((p) => perHour(p.packetsReceived, p.counterSpanSecs) !== null);
  const lastSignal = [...points].reverse().find((p) => finite(p.lastSnrDb));
  const uptime = series(points, (p) => (finite(p.uptimeSeconds) && p.uptimeSeconds >= 0 ? p.uptimeSeconds : null));
  return {
    // A battery never reads zero: a 0 mV reading is "no battery", as on the Observer tiles.
    battery: series(points, (p) => (finite(p.batteryMv) && p.batteryMv > 0 ? p.batteryMv / 1000 : null)),
    noise: series(points, (p) => p.noiseFloorDb),
    uptime,
    temperature: series(points, (p) => p.temperatureC),
    airtime: { latest: lastAir?.total ?? null, values: air.map((a) => a.total).filter(finite) },
    airtimeTx: lastAir?.tx ?? null,
    airtimeRx: lastAir?.rx ?? null,
    packets: series(points, (p) => perHour(p.packetsReceived, p.counterSpanSecs)),
    packetsSent: lastPackets ? perHour(lastPackets.packetsSent, lastPackets.counterSpanSecs) : null,
    signal: series(points, (p) => p.lastSnrDb),
    rssi: lastSignal && finite(lastSignal.lastRssiDb) ? lastSignal.lastRssiDb : null,
    errors: series(points, (p) => perHour(p.receiveErrors, p.counterSpanSecs)),
    rebooted: uptime.values.some((v, i) => i > 0 && v < uptime.values[i - 1]!),
    readings: points.length,
    latestAt: points.at(-1)?.t ?? null,
  };
}

// What the tile's sparkline draws. A few readings become isolated dots (a null between each, so the
// sparkline's lone-sample marker draws them); enough readings become a line.
export function sparkValues(values: number[]): (number | null)[] {
  if (values.length >= DOT_LIMIT) return values;
  return values.flatMap((v, i) => (i === 0 ? [v] : [null, v]));
}
