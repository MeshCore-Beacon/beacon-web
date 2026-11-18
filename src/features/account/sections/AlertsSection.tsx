import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FormStatus } from "../../../components/form/FormStatus";
import { useAlerts } from "../../../hooks/useAlerts";
import { authErrorText } from "../errors";
import { ALERT_KINDS } from "../alertRules";
import { unavailableText } from "../unavailableReason";
import type { AlertKind, AlertTarget, User } from "../types";
import { AlertChannels } from "./AlertChannels";
import { AlertRow } from "./AlertRow";
import { ProfileSection } from "./ProfileSection";
import { useSessionEnded } from "./useSessionEnded";

function TargetBlock({ target }: { target: AlertTarget }) {
  const { t } = useTranslation();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const name = target.name || target.publicKey.slice(0, 8);
  const has = (k: AlertKind) => target.available.includes(k);
  const rules = new Map(target.rules.map((r) => [r.kind, r]));
  const goneQuietOn = rules.get("gone_quiet")?.enabled === true;
  const off = ALERT_KINDS.filter((k) => target.unavailable[k] !== undefined && !has(k));
  const enabledRules = target.rules.filter((r) => r.enabled);
  const firing = enabledRules.filter((r) => r.state === "firing");
  const count = enabledRules.length;
  const lead = firing.length === 0 ? null : firing.length === 1
    ? t("account.alerts.firing", { count: 1, name: t(`account.alerts.kinds.${firing[0]?.kind}.name`) })
    : t("account.alerts.firing", { count: firing.length });
  const tail = count === 0 ? t("account.alerts.none") : t("account.alerts.onCount", { count });
  return (
    <div role="group" aria-label={name} className="flex flex-col gap-2">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-base px-3 py-2 text-left sm:px-4"
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-mono text-sm font-semibold text-text-bright">{name}</span>
            <span className="text-xs text-text-muted">
              {lead && <span className="font-semibold text-danger">{lead}</span>}
              {lead && count > 0 ? " · " : ""}
              {(lead === null || count > 0) && tail}
            </span>
          </span>
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 fill-none stroke-current text-text-muted transition-transform ${open ? "rotate-180" : ""}`} strokeWidth="2">
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </h3>
      {/* Hidden, not unmounted, so an unsaved threshold survives a collapse. */}
      <ul id={panelId} hidden={!open} className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-bg-base px-3 sm:px-4">
        {ALERT_KINDS.filter(has).map((k) => <AlertRow key={`${k}:${rules.get(k)?.id}:${rules.get(k)?.threshold}:${rules.get(k)?.thresholdHigh}`} target={target} kind={k} rule={rules.get(k)} goneQuietOn={goneQuietOn} />)}
        {off.map((k) => (
          <li key={k} className="flex flex-col gap-1 py-3 opacity-60">
            <span className="font-mono text-sm font-semibold text-text-bright">{t(`account.alerts.kinds.${k}.name`)}</span>
            <p className="text-xs text-text-muted">{unavailableText(t, k, target.unavailableCodes?.[k], target.unavailable[k] ?? "")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AlertsSection({ user }: { user: User }) {
  const { t } = useTranslation();
  const ended = useSessionEnded();
  const list = useAlerts();
  useEffect(() => {
    if (list.error) ended(list.error);
  }, [list.error, ended]);

  const data = list.data;
  const rulesOn = data?.targets.some((target) => target.rules.some((r) => r.enabled)) ?? false;

  return (
    <ProfileSection id="profile-alerts" title={t("account.alerts.title")} description={t("account.alerts.about")}>
      {list.isPending && <FormStatus>{t("account.alerts.loading")}</FormStatus>}
      {list.isError && <FormStatus kind="error">{authErrorText(t, list.error)}</FormStatus>}
      {data && (
        <>
          <AlertChannels channels={data.channels} email={user.email} rulesOn={rulesOn} />
          {data.targets.length === 0 ? (
            <p className="text-sm text-text-normal">
              {t("account.alerts.empty")} <Link to={{ search: "?tab=Atlas" }} className="text-primary hover:underline">{t("account.alerts.openAtlas")}</Link>
            </p>
          ) : (
            <div className="flex flex-col gap-5">{data.targets.map((target) => <TargetBlock key={`${target.kind}:${target.publicKey}`} target={target} />)}</div>
          )}
          <p className="text-xs text-text-muted">{t("account.alerts.always")}</p>
        </>
      )}
    </ProfileSection>
  );
}
