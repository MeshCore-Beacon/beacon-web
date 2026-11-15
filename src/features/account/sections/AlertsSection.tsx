import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FormStatus } from "../../../components/form/FormStatus";
import { useAlerts } from "../../../hooks/useAlerts";
import { useFeatures } from "../../../hooks/useFeatures";
import { authErrorText } from "../errors";
import { ALERT_KINDS } from "../alertRules";
import { unavailableText } from "../unavailableReason";
import type { AlertKind, AlertTarget, User } from "../types";
import { AlertRow } from "./AlertRow";
import { ProfileSection } from "./ProfileSection";
import { useSessionEnded } from "./useSessionEnded";

function TargetBlock({ target }: { target: AlertTarget }) {
  const { t } = useTranslation();
  const name = target.name || target.publicKey.slice(0, 8);
  const has = (k: AlertKind) => target.available.includes(k);
  const rules = new Map(target.rules.map((r) => [r.kind, r]));
  const goneQuietOn = rules.get("gone_quiet")?.enabled === true;
  const off = ALERT_KINDS.filter((k) => target.unavailable[k] !== undefined && !has(k));
  return (
    <div role="group" aria-label={name} className="flex flex-col gap-1">
      <h3 className="font-mono text-sm font-semibold text-text-bright">{name}</h3>
      <ul className="flex flex-col divide-y divide-border-subtle">
        {ALERT_KINDS.filter(has).map((k) => <AlertRow key={`${k}:${rules.get(k)?.id}:${rules.get(k)?.threshold}:${rules.get(k)?.thresholdHigh}`} target={target} kind={k} rule={rules.get(k)} goneQuietOn={goneQuietOn} />)}
        {off.map((k) => (
          <li key={k} className="flex flex-col gap-1 py-3 opacity-60">
            <span className="font-mono text-sm text-text-bright">{t(`account.alerts.kinds.${k}.name`)}</span>
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
  const features = useFeatures();
  const list = useAlerts();
  useEffect(() => {
    if (list.error) ended(list.error);
  }, [list.error, ended]);

  const data = list.data;
  const delivery = data?.delivery ?? features.alertDelivery;

  return (
    <ProfileSection id="profile-alerts" title={t("account.alerts.title")}>
      {list.isPending && <FormStatus>{t("account.alerts.loading")}</FormStatus>}
      {list.isError && <FormStatus kind="error">{authErrorText(t, list.error)}</FormStatus>}
      {data && (
        <>
          <div className="flex flex-col gap-1 text-sm text-text-normal">
            <p>{delivery === "push" ? t("account.alerts.toApp") : t("account.alerts.toEmail", { email: user.email })}</p>
            {delivery === "push" && !data.hasDevice && <p>{t("account.alerts.noDevice")}</p>}
          </div>
          {data.targets.length === 0 ? (
            <p className="text-sm text-text-normal">
              {t("account.alerts.empty")} <Link to={{ search: "?tab=Atlas" }} className="text-primary hover:underline">{t("account.alerts.openAtlas")}</Link>
            </p>
          ) : (
            data.targets.map((target) => <TargetBlock key={`${target.kind}:${target.publicKey}`} target={target} />)
          )}
          <p className="text-xs text-text-muted">{t("account.alerts.always")}</p>
        </>
      )}
    </ProfileSection>
  );
}
