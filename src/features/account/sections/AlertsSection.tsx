import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { FormStatus } from "../../../components/form/FormStatus";
import { useAlerts } from "../../../hooks/useAlerts";
import { useFeatures } from "../../../hooks/useFeatures";
import { authErrorText } from "../errors";
import { activeRules } from "../alertRules";
import type { AlertTarget, User } from "../types";
import { AlertChannels } from "./AlertChannels";
import { AlertRuleList } from "./AlertRuleList";
import { ProfileSection } from "./ProfileSection";
import { useSessionEnded } from "./useSessionEnded";

function TargetBlock({ target }: { target: AlertTarget }) {
  const { t } = useTranslation();
  const panelId = useId();
  // Undefined until first opened. Keep visited editors mounted so a collapse preserves draft thresholds.
  const [open, setOpen] = useState<boolean>();
  const name = target.name || target.publicKey.slice(0, 8);
  const { on: enabledRules, firing } = activeRules(target);
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
          aria-expanded={open === true}
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
      <div id={panelId} hidden={!open}>{open !== undefined && <AlertRuleList target={target} />}</div>
    </div>
  );
}

export function AlertsSection({ user }: { user: User }) {
  const { t } = useTranslation();
  const ended = useSessionEnded();
  const list = useAlerts();
  const { alertChannelsSent } = useFeatures();
  const [params] = useSearchParams();
  const wanted = params.get("section") === "alerts";
  // The Atlas alert dialog links here; this section sits well down the profile.
  useEffect(() => {
    if (wanted) document.getElementById("profile-alerts")?.scrollIntoView?.({ block: "start" });
  }, [wanted]);
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
          {/* An older server has no channel switches; its rules still work. */}
          {alertChannelsSent && data.channels && <AlertChannels channels={data.channels} email={user.email} rulesOn={rulesOn} />}
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
