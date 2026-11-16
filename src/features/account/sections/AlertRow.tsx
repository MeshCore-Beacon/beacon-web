import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionMutation } from "../../../hooks/useSessionMutation";
import { alerts } from "../../../api/auth";
import { Timestamp } from "../../../components/Timestamp";
import { fieldClassRoomy } from "../../../components/form/fieldStyles";
import { ALERTS_KEY } from "../../../hooks/useAlerts";
import { useDisplayUnits } from "../../../hooks/useFeatures";
import { tempSymbol } from "../../../lib/units";
import { alertErrorText } from "../errors";
import {
  BATTERY_FALLING_STEPS, CLOCK_SECONDS, OBSERVER_OFFLINE_MINUTES, durationText, goneQuietHours, inputsFor, parseInputs, temperatureLimits, type Inputs,
} from "../alertRules";
import type { AlertKind, AlertRule, AlertTarget } from "../types";
import { useSessionEnded } from "./useSessionEnded";

const minutesText = (t: TFunction, m: number) => (m % 60 === 0 ? durationText(t, "hours", m / 60) : durationText(t, "minutes", m));
const secondsText = (t: TFunction, s: number) => (s >= 86400 ? durationText(t, "days", s / 86400) : s >= 3600 ? durationText(t, "hours", s / 3600) : durationText(t, "minutes", s / 60));

export function AlertRow({ target, kind, rule, goneQuietOn }: { target: AlertTarget; kind: AlertKind; rule: AlertRule | undefined; goneQuietOn: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ended = useSessionEnded();
  const { temperature: tempUnit } = useDisplayUnits();
  const [inputs, setInputs] = useState<Inputs>(() => inputsFor(kind, rule, tempUnit));
  const [local, setLocal] = useState<string | null>(null);

  const save = useSessionMutation({
    mutationFn: (body: { threshold: number | null; thresholdHigh: number | null; enabled: boolean }) =>
      alerts.putRule({ target: { kind: target.kind, publicKey: target.publicKey }, kind, ...body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_KEY }),
    onError: ended,
  });

  const checked = save.isPending ? save.variables.enabled : rule?.enabled ?? false;
  const blocked = kind === "back_online" && !goneQuietOn && !checked;

  // Validates the inputs and sends them; an invalid value shows an error and sends nothing.
  const send = (next: Inputs, enabled: boolean) => {
    const parsed = parseInputs(kind, next, tempUnit);
    if (!parsed.ok) {
      setLocal(parsed.error);
      return;
    }
    setLocal(null);
    save.mutate({ threshold: parsed.threshold, thresholdHigh: parsed.thresholdHigh, enabled });
  };

  const toggle = () => {
    if (checked) {
      setLocal(null);
      save.mutate({ threshold: rule?.threshold ?? null, thresholdHigh: rule?.thresholdHigh ?? null, enabled: false });
    } else {
      send(inputs, true);
    }
  };

  const change = (key: keyof Inputs, value: string, now: boolean) => {
    const next = { ...inputs, [key]: value };
    setInputs(next);
    setLocal(null);
    if (now && rule?.enabled) send(next, true);
  };

  // Typed inputs save when focus leaves, and only if the value moved.
  const blur = () => {
    if (!rule?.enabled) return;
    // An unedited box still shows its rounded display (F), so re-parsing it would move the stored value.
    const shown = inputsFor(kind, rule, tempUnit);
    if (inputs.a === shown.a && inputs.b === shown.b) return;
    const parsed = parseInputs(kind, inputs, tempUnit);
    if (!parsed.ok) return setLocal(parsed.error);
    if (parsed.threshold === rule.threshold && parsed.thresholdHigh === rule.thresholdHigh) return;
    send(inputs, true);
  };

  const label = (key: string) => t(`account.alerts.fields.${key}`, { unit: tempSymbol(tempUnit) });
  const select = (key: string, options: number[], text: (n: number) => string) => (
    <select aria-label={label(key)} value={inputs.a} disabled={save.isPending} onChange={(e) => change("a", e.target.value, true)} className={`${fieldClassRoomy} !w-auto`}>
      {options.map((o) => <option key={o} value={o}>{text(o)}</option>)}
    </select>
  );
  const text = (key: string, field: keyof Inputs, placeholder: string) => (
    <input
      type="text" inputMode="decimal" autoComplete="off" aria-label={label(key)} placeholder={placeholder}
      value={inputs[field]} disabled={save.isPending} aria-invalid={local ? true : undefined}
      onChange={(e) => change(field, e.target.value, false)} onBlur={blur} className={`${fieldClassRoomy} !w-28`}
    />
  );

  let input = null;
  switch (kind) {
    case "gone_quiet": input = select("hours", goneQuietHours(target, rule?.threshold ?? null), (h) => durationText(t, "hours", h)); break;
    case "battery_falling": input = select("drop", BATTERY_FALLING_STEPS, (m) => t("account.alerts.voltsPerDay", { volts: (m / 1000).toFixed(1) })); break;
    case "clock": input = select("drift", CLOCK_SECONDS, (s) => secondsText(t, s)); break;
    case "observer_offline": input = select("offline", OBSERVER_OFFLINE_MINUTES, (m) => minutesText(t, m)); break;
    case "battery_low": input = text("volts", "a", "3.50"); break;
    case "noise_high": input = text("dbm", "a", "-90"); break;
    case "temperature": input = <>{text("low", "a", tempUnit === "f" ? "14" : "-10.0")}<span aria-hidden className="text-text-dim">–</span>{text("high", "b", tempUnit === "f" ? "104" : "40.0")}</>; break;
  }

  const name = t(`account.alerts.kinds.${kind}.name`);
  const unit = kind === "battery_low" ? "V" : kind === "noise_high" ? "dBm" : kind === "temperature" ? tempSymbol(tempUnit) : null;
  const error = local ? t(`account.alerts.errors.${local}`, temperatureLimits(tempUnit)) : save.isError ? alertErrorText(t, save.error, kind) : null;

  const stateText = rule ? t(`account.alerts.state.${rule.state}`) : null;

  return (
    <li data-testid={`alert-${kind}`} className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-sm font-semibold text-text-bright">{name}</span>
          <p className="text-xs text-text-muted">{t(`account.alerts.kinds.${kind}.when`)}</p>
        </div>
        <label className="-my-1.5 inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 font-mono text-xs text-text-muted">
          <input type="checkbox" role="switch" aria-label={t("account.alerts.turnOn", { name })} checked={checked} disabled={blocked || save.isPending} onChange={toggle} className="peer sr-only" />
          <span aria-hidden className="relative h-5 w-9 rounded-full border border-border bg-bg-raised transition-colors peer-checked:border-primary peer-checked:bg-primary peer-disabled:opacity-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary after:absolute after:left-0.5 after:top-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-text-muted after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-bg-base motion-reduce:transition-none motion-reduce:after:transition-none" />
          <span aria-hidden className="w-6">{checked ? t("account.alerts.on") : t("account.alerts.off")}</span>
        </label>
      </div>
      {input && <div className="flex flex-wrap items-center gap-2">{input}{unit && <span className="font-mono text-xs text-text-muted">{unit}</span>}</div>}
      {blocked && <p className="text-xs text-text-muted">{t("account.alerts.backOnlineHint", { name: t("account.alerts.kinds.gone_quiet.name") })}</p>}
      {stateText && (
        <p className="font-mono text-xs text-text-normal">
          {stateText}{rule?.state === "firing" && <> <Timestamp value={rule.stateChangedAt} /></>}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </li>
  );
}
