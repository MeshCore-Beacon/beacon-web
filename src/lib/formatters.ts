// hex and time display helpers

export function formatHex(hex: string): string {
  return hex.slice(0, 8).toUpperCase();
}

// The single absolute timestamp format used across the app: local YYYY-MM-DD HH:MM:SS (24h). Pass
// { ms: true } to append .mmm where sub-second ordering matters (e.g. trace packets heard ms apart).
// Rendered via the <Timestamp> component (relative text, this on hover) — see components/Timestamp.tsx.
export function formatAbsolute(epochMs: number, opts?: { ms?: boolean }): string {
  const d = new Date(epochMs);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const base =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return opts?.ms ? `${base}.${pad(d.getMilliseconds(), 3)}` : base;
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

// Compact large counts for KPI/stat displays: 932 -> "932", 14732 -> "14.7k", 8_900_000 -> "8.9M".
export function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) < 1000) return String(n);
  const fmt = (div: number, suffix: string) => `${(n / div).toFixed(1).replace(/\.0$/, "")}${suffix}`;
  // pick the unit from the rounded value so 999_999 rolls to "1M" instead of "1000k"
  const fits = (div: number) => Math.abs(Math.round((n / div) * 10)) < 10_000;
  if (fits(1_000)) return fmt(1_000, "k");
  if (fits(1_000_000)) return fmt(1_000_000, "M");
  return fmt(1_000_000_000, "B");
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

// Node/observer summaries carry radio as a compact "freq,bw,sf" string (e.g. "915.0,250,11").
// Formats freq/SF/bandwidth like the observer panel ("915 MHz · SF11 · 250 kHz"); the compact
// string carries no coding rate, so there's no "CR 4/x" segment.
export function formatRadio(radio: string | null | undefined): string | null {
  if (!radio) return null;
  const [freq, bw, sf] = radio.split(",");
  if (!freq || !bw || !sf) return radio; // unexpected shape — show it raw rather than hide it
  const f = Number(freq), b = Number(bw);
  if (Number.isNaN(f) || Number.isNaN(b)) return radio; // non-numeric freq/bw — show raw, not "NaN MHz"
  return `${f} MHz · SF${sf} · ${b} kHz`;
}
