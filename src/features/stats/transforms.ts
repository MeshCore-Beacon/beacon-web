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

// True if any point carries at least one meaningful (non-null, non-zero) metric. Bots / MQTT bridges
// report telemetry rows that are all zeros (no real radio hardware); those count as "no telemetry"
// so we show an empty state rather than a wall of flat-zero charts.
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
