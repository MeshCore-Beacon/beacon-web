// hex and time display helpers

export function formatHex(hex: string): string {
  return hex.slice(0, 8).toUpperCase();
}

export function formatTimestamp(epochMs: number): string {
  // force a 12h clock for now; could become a per-user setting later
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatTimeOnly(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// signal quality and radio metric formatting

export type SignalLevel = "good" | "mid" | "bad";

export const SIGNAL_LEVEL_CLASSES: Record<SignalLevel, string> = {
  good: "text-green",
  mid: "text-warn",
  bad: "text-danger",
};

export function snrLevel(snr: number | null | undefined): SignalLevel | null {
  if (snr == null) return null;
  if (snr >= 10) return "good";
  if (snr >= 5) return "mid";
  return "bad";
}

export function formatSnr(snr: number | null | undefined): string {
  if (snr == null) return "—";
  return snr.toFixed(2);
}

export function formatPropagation(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(3)}s`;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatBattery(volts: number): string {
  return `${volts.toFixed(2)}V`;
}

// /nodes sends lat/lng as integer microdegrees (45141660 = 45.141660); scale those to decimal.
// Values that are already decimal pass through untouched — the integer check tells them apart.
export function microToDeg(v: number): number {
  return Number.isInteger(v) ? v / 1e6 : v;
}

// clamp negative values from clock skew
export function timeAgoMs(epochMs: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - epochMs) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function timeAgo(iso: string): string {
  return timeAgoMs(new Date(iso).getTime());
}
