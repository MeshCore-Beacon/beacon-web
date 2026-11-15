import type { TFunction } from "i18next";
import type { AlertKind, AlertRule, AlertTarget } from "./types";

// The order of the plan's alert kinds table; rows follow it.
export const ALERT_KINDS: AlertKind[] = [
  "gone_quiet", "back_online", "battery_low", "battery_falling", "rebooted", "temperature", "noise_high", "clock", "observer_offline",
];

// A kind that needs a polled repeater or an observer reporting telemetry.
const TELEMETRY_KINDS = new Set(["battery_low", "battery_falling", "rebooted", "temperature", "noise_high"]);

export function goneQuietHours(target: AlertTarget, current: number | null): number[] {
  const short = target.kind === "observer" || target.available.some((k) => TELEMETRY_KINDS.has(k));
  const hours = short ? [3, 6, 12, 24, 48] : [12, 24, 48];
  if (current != null && !hours.includes(current)) hours.push(current);
  return hours.sort((a, b) => a - b);
}

export const BATTERY_FALLING_STEPS = [100, 200, 300];
export const CLOCK_SECONDS = [300, 3600, 86400];
export const OBSERVER_OFFLINE_MINUTES = [30, 60, 180, 360];

export type Inputs = { a: string; b: string };

// What the inputs show for a rule, or the first choice when there is none.
export function inputsFor(kind: AlertKind, rule: AlertRule | undefined): Inputs {
  const th = rule?.threshold ?? null;
  switch (kind) {
    case "gone_quiet": return { a: String(th ?? 24), b: "" };
    case "battery_falling": return { a: String(th ?? 100), b: "" };
    case "clock": return { a: String(th ?? 3600), b: "" };
    case "observer_offline": return { a: String(th ?? 60), b: "" };
    case "battery_low": return { a: th == null ? "" : (th / 1000).toFixed(2), b: "" };
    case "noise_high": return { a: th == null ? "" : String(th), b: "" };
    case "temperature": return { a: th == null ? "" : (th / 10).toFixed(1), b: rule?.thresholdHigh == null ? "" : (rule.thresholdHigh / 10).toFixed(1) };
    default: return { a: "", b: "" };
  }
}

export type Parsed = { ok: true; threshold: number | null; thresholdHigh: number | null } | { ok: false; error: string };

function num(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Turns the typed values into the units the server takes, or an inline error key.
export function parseInputs(kind: AlertKind, { a, b }: Inputs): Parsed {
  switch (kind) {
    case "gone_quiet": case "battery_falling": case "clock": case "observer_offline":
      return { ok: true, threshold: Number(a), thresholdHigh: null };
    case "battery_low": {
      const v = num(a);
      if (v == null || Number.isNaN(v) || v < 2.5 || v > 5) return { ok: false, error: "battery_low" };
      return { ok: true, threshold: Math.round(v * 1000), thresholdHigh: null };
    }
    case "noise_high": {
      const v = num(a);
      if (v == null || Number.isNaN(v) || v < -130 || v > -50) return { ok: false, error: "noise_high" };
      return { ok: true, threshold: Math.round(v), thresholdHigh: null };
    }
    case "temperature": {
      const low = num(a);
      const high = num(b);
      if (Number.isNaN(low) || Number.isNaN(high)) return { ok: false, error: "temperature_number" };
      if (low == null && high == null) return { ok: false, error: "temperature_one" };
      if (low != null && high != null && low >= high) return { ok: false, error: "temperature_order" };
      const tenths = (v: number | null) => (v == null ? null : Math.round(v * 10));
      if ([tenths(low), tenths(high)].some((v) => v != null && (v < -500 || v > 1500))) return { ok: false, error: "temperature_range" };
      return { ok: true, threshold: tenths(low), thresholdHigh: tenths(high) };
    }
    default:
      return { ok: true, threshold: null, thresholdHigh: null };
  }
}

export function durationText(t: TFunction, unit: "minutes" | "hours" | "days", count: number): string {
  return t(`account.alerts.${unit}`, { count });
}
