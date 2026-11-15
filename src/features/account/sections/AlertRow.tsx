import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { alerts } from "../../../api/auth";
import { Timestamp } from "../../../components/Timestamp";
import { fieldClass } from "../../../components/form/fieldStyles";
import { ALERTS_KEY } from "../../../hooks/useAlerts";
import { alertErrorText } from "../errors";
import {
  BATTERY_FALLING_STEPS, CLOCK_SECONDS, OBSERVER_OFFLINE_MINUTES, durationText, goneQuietHours, inputsFor, parseInputs, type Inputs,
} from "../alertRules";
import type { AlertKind, AlertRule, AlertTarget } from "../types";
import { useSessionEnded } from "./useSessionEnded";

const minutesText = (t: TFunction, m: number) => (m % 60 === 0 ? durationText(t, "hours", m / 60) : durationText(t, "minutes", m));
const secondsText = (t: TFunction, s: number) => (s >= 86400 ? durationText(t, "days", s / 86400) : s >= 3600 ? durationText(t, "hours", s / 3600) : durationText(t, "minutes", s / 60));

export function AlertRow({ target, kind, rule, goneQuietOn }: { target: AlertTarget; kind: AlertKind; rule: AlertRule | undefined; goneQuietOn: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ended = useSessionEnded();
  const [inputs, setInputs] = useState<Inputs>(() => inputsFor(kind, rule));
  const [local, setLocal] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: { threshold: number | null; thresholdHigh: number | null; enabled: boolean }) =>
      alerts.putRule({ target: { kind: target.kind, publicKey: target.publicKey }, kind, ...body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ALERTS_KEY }),
    onError: ended,
  });

  const checked = save.isPending ? save.variables.enabled : rule?.enabled ?? false;
  const blocked = kind === "back_online" && !goneQuietOn && !checked;

  // Validates the inputs and sends them; an invalid value shows an error and sends nothing.
  const send = (next: Inputs, enabled: boolean) => {
    const parsed = parseInputs(kind, next);
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
    const parsed = parseInputs(kind, inputs);
    if (!parsed.ok) return setLocal(parsed.error);
    if (parsed.threshold === rule.threshold && parsed.thresholdHigh === rule.thresholdHigh) return;
    send(inputs, true);
  };

  const label = (key: string) => t(`account.alerts.fields.${key}`);
  const select = (key: string, options: number[], text: (n: number) => string) => (
    <select aria-label={label(key)} value={inputs.a} disabled={save.isPending} onChange={(e) => change("a", e.target.value, true)} className={`${fieldClass} w-auto`}>
      {options.map((o) => <option key={o} value={o}>{text(o)}</option>)}
    </select>
  );
  const text = (key: string, field: keyof Inputs, placeholder: string) => (
    <input
      type="text" inputMode="decimal" autoComplete="off" aria-label={label(key)} placeholder={placeholder}
      value={inputs[field]} disabled={save.isPending} aria-invalid={local ? true : undefined}
      onChange={(e) => change(field, e.target.value, false)} onBlur={blur} className={`${fieldClass} w-24`}
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
    case "temperature": input = <>{text("low", "a", "-10.0")}{text("high", "b", "40.0")}</>; break;
  }

  const name = t(`account.alerts.kinds.${kind}.name`);
  const error = local ? t(`account.alerts.errors.${local}`) : save.isError ? alertErrorText(t, save.error) : null;

  return (
    <li data-testid={`alert-${kind}`} className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm text-text-bright">{name}</span>
        <input type="checkbox" role="switch" aria-label={t("account.alerts.turnOn", { name })} checked={checked} disabled={blocked || save.isPending} onChange={toggle} className="h-4 w-4" />
      </div>
      <p className="text-xs text-text-muted">{t(`account.alerts.kinds.${kind}.when`)}</p>
      {input && <div className="flex flex-wrap items-center gap-2">{input}</div>}
      {blocked && <p className="text-xs text-text-muted">{t("account.alerts.backOnlineHint", { name: t("account.alerts.kinds.gone_quiet.name") })}</p>}
      {rule && (
        <p className="font-mono text-xs text-text-normal">
          {t(`account.alerts.state.${rule.state}`)}{rule.state === "firing" && <> <Timestamp value={rule.stateChangedAt} /></>}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </li>
  );
}
