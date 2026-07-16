import type { RadioPreset, TelemetryPoint } from "./types";

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

// A point with no meaningful (non-null, non-zero) metric. The server writes an all-zero telemetry
// row whenever a /status message arrives without a usable `stats` block (empty announce frames,
// bots / MQTT bridges); those aren't real readings, so we drop them rather than plot flat zeros.
export function isEmptyPoint(p: TelemetryPoint): boolean {
  const live = (v: number | null) => v != null && v !== 0;
  return !(
    live(p.batteryMv) ||
    live(p.airtimeTxPct) ||
    live(p.airtimeRxPct) ||
    live(p.noiseFloorDb) ||
    live(p.uptimeSeconds) ||
    live(p.queueLength) ||
    live(p.receiveErrors)
  );
}

// True if any point carries real telemetry; an all-empty series means "no telemetry" and we show
// an empty state instead of flat-zero charts.
export function hasTelemetry(points: TelemetryPoint[]): boolean {
  return points.some((p) => !isEmptyPoint(p));
}
