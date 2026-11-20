import { useTranslation } from "react-i18next";
import { ALERT_KINDS } from "../alertRules";
import { unavailableText } from "../unavailableReason";
import type { AlertKind, AlertTarget } from "../types";
import { AlertRow } from "./AlertRow";

// One radio's rules: a row per kind it can have, then the kinds it cannot with the reason. Profile and Atlas share it.
export function AlertRuleList({ target }: { target: AlertTarget }) {
  const { t } = useTranslation();
  const has = (k: AlertKind) => target.available.includes(k);
  const rules = new Map(target.rules.map((r) => [r.kind, r]));
  const goneQuietOn = rules.get("gone_quiet")?.enabled === true;
  const off = ALERT_KINDS.filter((k) => target.unavailable[k] !== undefined && !has(k));
  return (
    <ul className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-bg-base px-3 sm:px-4">
      {ALERT_KINDS.filter(has).map((k) => <AlertRow key={`${k}:${rules.get(k)?.id}:${rules.get(k)?.threshold}:${rules.get(k)?.thresholdHigh}`} target={target} kind={k} rule={rules.get(k)} goneQuietOn={goneQuietOn} />)}
      {off.map((k) => (
        <li key={k} className="flex flex-col gap-1 py-3 opacity-60">
          <span className="font-mono text-sm font-semibold text-text-bright">{t(`account.alerts.kinds.${k}.name`)}</span>
          <p className="text-xs text-text-muted">{unavailableText(t, k, target.unavailableCodes?.[k], target.unavailable[k] ?? "")}</p>
        </li>
      ))}
    </ul>
  );
}
