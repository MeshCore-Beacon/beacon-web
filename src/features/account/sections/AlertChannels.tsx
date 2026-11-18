import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { alerts } from "../../../api/auth";
import { Switch } from "../../../components/form/Switch";
import { ALERTS_KEY } from "../../../hooks/useAlerts";
import { useSessionMutation } from "../../../hooks/useSessionMutation";
import { alertErrorText } from "../errors";
import type { AlertChannels as Channels, AlertsResponse } from "../types";
import { useSessionEnded } from "./useSessionEnded";

type Key = "email" | "push";
const EMAIL_REASONS = new Set(["server_off", "portal_account", "unverified_email"]);

function Row({ name, label, checked, disabled, onChange, children }: { name: string; label: string; checked: boolean; disabled: boolean; onChange: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const noteId = useId();
  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-sm font-semibold text-text-bright">{name}</span>
        <Switch label={label} checked={checked} disabled={disabled} onChange={onChange} describedBy={noteId} stateText={checked ? t("account.alerts.on") : t("account.alerts.off")} />
      </div>
      <div id={noteId} className="flex flex-col gap-1 text-xs text-text-muted">{children}</div>
    </li>
  );
}

// The user's email and push switches. The flipped switch shows its new state while the save is in flight, so a
// refused save falls back to the stored value by itself.
export function AlertChannels({ channels, email, rulesOn }: { channels: Channels; email: string; rulesOn: boolean }) {
  const { t } = useTranslation();
  const titleId = useId();
  const queryClient = useQueryClient();
  const ended = useSessionEnded();
  const save = useSessionMutation({
    mutationFn: ({ key, on }: { key: Key; on: boolean }) => alerts.putChannels(key === "email" ? { email: on } : { push: on }),
    onSuccess: (next) => queryClient.setQueryData<AlertsResponse>(ALERTS_KEY, (d) => (d ? { ...d, channels: next } : d)),
    onError: ended,
  });

  const on = (key: Key) => (save.isPending && save.variables.key === key ? save.variables.on : channels[key].enabled);
  const flip = (key: Key) => save.mutate({ key, on: !on(key) });
  const { email: mail, push } = channels;
  const reaches = (mail.available && on("email")) || (push.available && on("push"));
  const emailReason = EMAIL_REASONS.has(mail.reason) ? mail.reason : "unavailable";

  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-bg-base px-3 pt-3 sm:px-4">
      <h3 id={titleId} className="font-mono text-sm font-semibold text-text-bright">{t("account.alerts.channels.title")}</h3>
      <ul className="flex flex-col divide-y divide-border-subtle">
        <Row name={t("account.alerts.channels.email")} label={t("account.alerts.channels.emailLabel")} checked={on("email")} disabled={!mail.available || save.isPending} onChange={() => flip("email")}>
          <p>{mail.available ? t("account.alerts.channels.emailTo", { email }) : t(`account.alerts.channels.emailReasons.${emailReason}`)}</p>
        </Row>
        <Row name={t("account.alerts.channels.push")} label={t("account.alerts.channels.pushLabel")} checked={on("push")} disabled={!push.available || save.isPending} onChange={() => flip("push")}>
          {push.available ? (
            <>
              {!push.hasDevice && <p className="text-text-normal">{t("account.alerts.channels.noDevice")}</p>}
              <p>{t("account.alerts.channels.pushNote")}</p>
            </>
          ) : <p>{t("account.alerts.channels.pushOff")}</p>}
        </Row>
      </ul>
      {save.isError && <p role="alert" className="pb-3 text-sm text-danger">{alertErrorText(t, save.error)}</p>}
      {rulesOn && !reaches && <p className="pb-3 text-sm text-warn">{t("account.alerts.channels.noneReach")}</p>}
    </div>
  );
}
