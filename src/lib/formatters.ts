// hex and time display helpers

export function formatHex(hex: string): string {
  return hex.slice(0, 8).toUpperCase();
}

export function formatTimestamp(epochMs: number): string {
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

export function snrLevel(snr: number | null): SignalLevel | null {
  if (snr === null) return null;
  if (snr >= 10) return "good";
  if (snr >= 5) return "mid";
  return "bad";
}

export function formatSnr(snr: number | null): string {
  if (snr === null) return "—";
  return snr.toFixed(2);
}

export function formatPropagation(ms: number | null): string {
  if (ms === null) return "—";
  return `${(ms / 1000).toFixed(3)}s`;
}
