import type { TFunction } from "i18next";

// beacon-server's unavailableCodes values, by the catalog key that carries each. The first three name the value the
// kind reads, which comes from WHAT.
const KEYS: Record<string, string> = {
  observer_no_data: "observerNoData",
  repeaters_only: "repeatersOnly",
  not_polled: "notPolled",
  no_data: "noData",
  observer_no_clock: "observerNoClock",
  clock_repeaters_only: "clockRepeatersOnly",
  needs_gone_quiet: "needsGoneQuiet",
  not_applicable: "notApplicable",
};
const NEEDS_WHAT = new Set(["observer_no_data", "repeaters_only", "no_data"]);
const WHAT: Record<string, string> = {
  battery_low: "battery", battery_falling: "battery", rebooted: "uptime", temperature: "temperature", noise_high: "noise",
};

// A reason in the user's language, by its code. No code (an older server) or one this build does not know shows the
// server's sentence as sent.
export function unavailableText(t: TFunction, kind: string, code: string | undefined, sentence: string): string {
  if (!code || !KEYS[code]) return sentence;
  if (!NEEDS_WHAT.has(code)) return t(`account.alerts.reason.${KEYS[code]}`);
  const what = WHAT[kind];
  return what ? t(`account.alerts.reason.${KEYS[code]}`, { what: t(`account.alerts.reasonWhat.${what}`) }) : sentence;
}
