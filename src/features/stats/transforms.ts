import type { ActivityPoint, PayloadBreakdownItem, RadioPreset, TelemetryPoint } from "./types";

// Collapse presets to one row each (keeping the node/observer split), dropping junk "0,0,0" configs.
export function aggregatePresets(rows: RadioPreset[]): { preset: string; nodes: number; observers: number }[] {
  const byPreset = new Map<string, { nodes: number; observers: number }>();
  for (const r of rows) {
    if (isJunkPreset(r.preset)) continue;
    const cur = byPreset.get(r.preset) ?? { nodes: 0, observers: 0 };
    if (r.sourceType === "node") cur.nodes += r.count;
    else cur.observers += r.count;
    byPreset.set(r.preset, cur);
  }
  return [...byPreset.entries()]
    .map(([preset, counts]) => ({ preset, ...counts }))
    .sort((a, b) => b.nodes + b.observers - (a.nodes + a.observers));
}

function isJunkPreset(preset: string): boolean {
  return preset.split(",").every((n) => Number(n) === 0);
}

// "freqMhz,bwKhz,sf" -> "910.525 · 62.5k · SF7" (freq is MHz by convention); anything that isn't a
// freq,bw,sf triple is shown as-is.
export function formatPreset(preset: string): string {
  const parts = preset.split(",");
  if (parts.length !== 3 || parts.some((p) => p === "" || Number.isNaN(Number(p)))) return preset;
  const [freq, bw, sf] = parts;
  return `${freq} · ${bw}k · SF${sf}`;
}

// True if any point carries at least one meaningful (non-null, non-zero) metric. Stats-less observers
// (bots / MQTT bridges, no real radio hardware) used to report all-zero rows; the backend now drops
// those at ingest, but the non-zero guard stays as a cheap backstop so a stray all-zero row still
// counts as "no telemetry" (empty state) rather than a wall of flat-zero charts.
export function hasTelemetry(points: TelemetryPoint[]): boolean {
  const live = (v: number | null) => v != null && v !== 0;
  return points.some(
    (p) =>
      live(p.batteryMv) ||
      live(p.airtimeTxPct) ||
      live(p.airtimeRxPct) ||
      live(p.noiseFloorDb) ||
      live(p.uptimeSeconds) ||
      live(p.queueLength) ||
      live(p.receiveErrors),
  );
}

// "15m" / "6h" → ms; null for anything the server wouldn't send.
export function intervalToMs(interval: string): number | null {
  const m = /^(\d+)([mh])$/.exec(interval);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "m" ? n * 60_000 : n * 3_600_000;
}

// share of `windowSeconds` spent on air, rounded so tooltips don't show float noise
function pct(seconds: number, windowSeconds: number): number {
  return Math.round(((seconds * 100) / windowSeconds) * 1000) / 1000;
}

type AirtimeKey = "airtimeRxPct" | "airtimeTxPct";

// The values are on-air seconds despite the field name: cumulative on raw 1h points, per-bucket on
// bucketed ones. Chart the increase as a percent of the elapsed time, clamped at 0 on counter resets.
export function airtimePctSeries(points: TelemetryPoint[], key: AirtimeKey, bucketMs: number | null): [number, number | null][] {
  if (bucketMs != null) {
    return points.map((p) => {
      const v = p[key];
      return [p.t, v == null ? null : pct(v, bucketMs / 1000)];
    });
  }
  const out: [number, number | null][] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const a = prev[key];
    const b = cur[key];
    const gapMs = cur.t - prev.t;
    out.push([cur.t, a != null && b != null && gapMs > 0 ? pct(Math.max(0, b - a), gapMs / 1000) : null]);
  }
  return out;
}

// Most recent RX / TX percent, for the header stat.
export function latestAirtimePct(points: TelemetryPoint[], bucketMs: number | null): { rx: number | null; tx: number | null } {
  const last = (key: AirtimeKey) => {
    const s = airtimePctSeries(points, key, bucketMs);
    return s.length ? s[s.length - 1]![1] : null;
  };
  return { rx: last("airtimeRxPct"), tx: last("airtimeTxPct") };
}

// The server skips empty buckets; fill them so a quiet stretch draws as zero instead of a skipped line.
// Starts at the first complete bucket (the server rounds its window start up the same way) and lets
// one bucket past the window end through, so a client clock behind the server can't hide fresh data.
export function fillActivity(points: ActivityPoint[], intervalMs: number, window: { start: number; end: number }): ActivityPoint[] {
  const snap = (t: number) => Math.floor(t / intervalMs) * intervalMs;
  const first = Math.ceil(window.start / intervalMs) * intervalMs;
  const current = snap(window.end);
  const last = points.some((p) => snap(p.t) === current + intervalMs) ? current + intervalMs : current;
  const byBucket = new Map(points.map((p) => [snap(p.t), p]));
  const out: ActivityPoint[] = [];
  for (let t = first; t <= last; t += intervalMs) {
    out.push(byBucket.get(t) ?? { t, observations: 0, airtimeMs: 0, snrAvg: null, snrMin: null, rssiAvg: null });
  }
  return out;
}

// Payload breakdown rows as the bar chart wants them: busiest first, lowercase names.
export function payloadBarItems(items: PayloadBreakdownItem[]): { name: string; value: number }[] {
  return [...items].sort((a, b) => b.count - a.count).map((p) => ({ name: p.payloadTypeName.toLowerCase(), value: p.count }));
}

// Percent of a bucket spent receiving; null when the server couldn't cost the bucket.
export function busyPct(airtimeMs: number | null, intervalMs: number): number | null {
  return airtimeMs == null ? null : pct(airtimeMs / 1000, intervalMs / 1000);
}
