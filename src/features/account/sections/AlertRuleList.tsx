import { useEffect, useRef, type FocusEvent } from "react";
import { useTranslation } from "react-i18next";
import { ALERT_KINDS } from "../alertRules";
import { unavailableText } from "../unavailableReason";
import type { AlertKind, AlertTarget } from "../types";
import { AlertRow } from "./AlertRow";

const CONTROLS = "input, select, button";

// One radio's rules: a row per kind it can have, then the kinds it cannot with the reason. Profile and Atlas share it.
export function AlertRuleList({ target }: { target: AlertTarget }) {
  const { t } = useTranslation();
  const list = useRef<HTMLUListElement>(null);
  const held = useRef<{ el: HTMLElement; kind: string; label: string | null; dropped: boolean } | null>(null);
  const has = (k: AlertKind) => target.available.includes(k);
  const rules = new Map(target.rules.map((r) => [r.kind, r]));
  const goneQuietOn = rules.get("gone_quiet")?.enabled === true;
  const off = ALERT_KINDS.filter((k) => target.unavailable[k] !== undefined && !has(k));

  const onFocus = (e: FocusEvent<HTMLUListElement>) => {
    const kind = e.target.closest<HTMLElement>("[data-alert-kind]")?.dataset.alertKind;
    held.current = kind ? { el: e.target, kind, label: e.target.getAttribute("aria-label"), dropped: false } : null;
  };
  // Chrome blurs a control the moment a save disables it; that is focus dropped, not the user leaving.
  const onBlur = (e: FocusEvent<HTMLUListElement>) => {
    const was = held.current;
    if (!was || was.el !== e.target) return;
    if (!e.relatedTarget && e.target.matches(":disabled")) was.dropped = true;
    else if (e.target.isConnected) held.current = null;
  };
  // A save disables the focused control and may remount its row, leaving focus on the body, outside a
  // dialog's Tab trap. Once the control is usable again hand focus back to it, else to the dialog.
  useEffect(() => {
    const ul = list.current;
    if (!ul) return;
    const restore = () => {
      const was = held.current;
      if (!was || (was.el.isConnected && !was.dropped)) return;
      if (document.activeElement && document.activeElement !== document.body) {
        held.current = null;
        return;
      }
      const row = ul.querySelector(`[data-alert-kind="${was.kind}"]`);
      const next = Array.from(row?.querySelectorAll<HTMLElement>(CONTROLS) ?? []).find((el) => el.getAttribute("aria-label") === was.label);
      if (next?.matches(":disabled")) return;
      held.current = null;
      (next ?? ul.closest<HTMLElement>('[role="dialog"]'))?.focus();
    };
    const watch = new MutationObserver(restore);
    watch.observe(ul, { subtree: true, childList: true, attributes: true, attributeFilter: ["disabled"] });
    return () => watch.disconnect();
  }, []);

  return (
    <ul ref={list} onFocus={onFocus} onBlur={onBlur} className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-bg-base px-3 sm:px-4">
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
