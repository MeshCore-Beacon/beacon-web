import type { TFunction } from "i18next";
import type { AlertKind, AlertRule, AlertTarget } from "./types";
import { fromDisplayTemp, tempSymbol, toDisplayTemp, type TemperatureUnit } from "../../lib/units";

// The order of the plan's alert kinds table; rows follow it.
export const ALERT_KINDS: AlertKind[] = [
  "gone_quiet", "back_online", "battery_low", "battery_falling", "rebooted", "temperature", "noise_high", "clock", "observer_offline",
];

export function goneQuietHours(target: AlertTarget, current: number | null): number[] {
  const short = target.kind === "observer" || target.polled;
  const hours = short ? [3, 6, 12, 24, 48] : [12, 24, 48];
  if (current != null && !hours.includes(current)) hours.push(current);
  return hours.sort((a, b) => a - b);
}

export const BATTERY_FALLING_STEPS = [100, 200, 300];
export const CLOCK_SECONDS = [300, 3600, 86400];
export const OBSERVER_OFFLINE_MINUTES = [30, 60, 180, 360];

export type Inputs = { a: string; b: string };

// What the inputs show for a rule, or the first choice when there is none.
// Temperatures show one decimal in C and whole degrees in F; the wire stays tenths of a C.
export function inputsFor(kind: AlertKind, rule: AlertRule | undefined, unit: TemperatureUnit): Inputs {
  const th = rule?.threshold ?? null;
  switch (kind) {
    case "gone_quiet": return { a: String(th ?? 24), b: "" };
    case "battery_falling": return { a: String(th ?? 100), b: "" };
    case "clock": return { a: String(th ?? 3600), b: "" };
    case "observer_offline": return { a: String(th ?? 60), b: "" };
    case "battery_low": return { a: th == null ? "" : (th / 1000).toFixed(2), b: "" };
    case "noise_high": return { a: th == null ? "" : String(th), b: "" };
    case "temperature": return { a: showTemp(th, unit), b: showTemp(rule?.thresholdHigh ?? null, unit) };
    default: return { a: "", b: "" };
  }
}

function showTemp(tenths: number | null, unit: TemperatureUnit): string {
  if (tenths == null) return "";
  return unit === "f" ? Math.round(toDisplayTemp(tenths / 10, "f")).toString() : (tenths / 10).toFixed(1);
}

// The limits and minimum width as the temperature error text shows them, in the instance unit.
export function temperatureLimits(unit: TemperatureUnit): { min: string; max: string; width: string; example: string; unit: string } {
  if (unit === "f") return { min: String(Math.round(toDisplayTemp(-50, "f"))), max: String(Math.round(toDisplayTemp(150, "f"))), width: String(Math.ceil(2 * 1.8)), example: "95", unit: tempSymbol(unit) };
  return { min: "-50", max: "150", width: "2.0", example: "95", unit: tempSymbol(unit) };
}

export type Parsed = { ok: true; threshold: number | null; thresholdHigh: number | null } | { ok: false; error: string };

function num(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Turns the typed values into the units the server takes, or an inline error key.
export function parseInputs(kind: AlertKind, { a, b }: Inputs, unit: TemperatureUnit): Parsed {
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
    case "temperature": return parseTemperature(a, b, unit);
    default:
      return { ok: true, threshold: null, thresholdHigh: null };
  }
}

type Bound = { ok: true; tenths: number | null } | { ok: false; error: string };

// A typed limit in the instance unit as tenths of a degree C, or the first thing wrong with it.
function bound(text: string, unit: TemperatureUnit): Bound {
  const v = num(text);
  if (v == null) return { ok: true, tenths: null };
  if (Number.isNaN(v)) return { ok: false, error: "temperature_number" };
  if (unit === "f" && !Number.isInteger(v)) return { ok: false, error: "temperature_whole" };
  return { ok: true, tenths: Math.round((unit === "f" ? fromDisplayTemp(v, "f") : v) * 10) };
}

// Resolves both limits to tenths first (keep holds an untouched limit's stored tenths), then checks that pair.
export function parseTemperature(a: string, b: string, unit: TemperatureUnit, keep: { a?: number; b?: number } = {}): Parsed {
  const low = keep.a !== undefined ? { ok: true as const, tenths: keep.a } : bound(a, unit);
  if (!low.ok) return low;
  const high = keep.b !== undefined ? { ok: true as const, tenths: keep.b } : bound(b, unit);
  if (!high.ok) return high;
  const [lo, hi] = [low.tenths, high.tenths];
  if (lo == null && hi == null) return { ok: false, error: "temperature_one" };
  if (lo != null && hi != null && lo >= hi) return { ok: false, error: "temperature_order" };
  if ([lo, hi].some((v) => v != null && (v < -500 || v > 1500))) return { ok: false, error: "temperature_range" };
  // The server refuses a range under 2.0 degrees (20 tenths) with invalid_threshold.
  if (lo != null && hi != null && hi - lo < 20) return { ok: false, error: "temperature_width" };
  return { ok: true, threshold: lo, thresholdHigh: hi };
}

export function durationText(t: TFunction, unit: "minutes" | "hours" | "days", count: number): string {
  return t(`account.alerts.${unit}`, { count });
}
