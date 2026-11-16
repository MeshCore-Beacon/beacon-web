import { toDisplayTemp, type TemperatureUnit } from "../../lib/units";
import type { NodeLatestReading } from "../nodes/types";

const MIN = 60_000;
const HOUR = 3_600_000;
const OLD_MS = 48 * HOUR;

function age(ms: number): string {
  if (ms < HOUR) return `${Math.floor(ms / MIN)}m`;
  if (ms < OLD_MS) return `${Math.floor(ms / HOUR)}h`;
  return `${Math.floor(ms / (24 * HOUR))}d`;
}

// Map label such as "4.08V  1°  38m"; null when the reading has neither value. Readings 48h or older are flagged old.
export function telemetryLabel(r: NodeLatestReading, unit: TemperatureUnit, now: number): { text: string; old: boolean } | null {
  const parts: string[] = [];
  if (r.batteryMv != null) parts.push(`${(r.batteryMv / 1000).toFixed(2)}V`);
  if (r.temperatureC != null) parts.push(`${Math.round(toDisplayTemp(r.temperatureC, unit)) + 0}°`);
  if (parts.length === 0) return null;
  const ageMs = Math.max(0, now - r.sampledAt);
  parts.push(age(ageMs));
  return { text: parts.join("  "), old: ageMs >= OLD_MS };
}

type Labels = Map<string, { text: string; old: boolean }>;

// Returns prev when next holds the same labels, so a no-op age tick doesn't re-feed the map source.
export function stableLabels(prev: Labels, next: Labels): Labels {
  if (prev.size !== next.size) return next;
  for (const [id, l] of next) {
    const p = prev.get(id);
    if (!p || p.text !== l.text || p.old !== l.old) return next;
  }
  return prev;
}
