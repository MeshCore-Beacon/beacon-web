import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionMutation } from "../../../hooks/useSessionMutation";
import { me } from "../../../api/auth";
import { Timestamp } from "../../../components/Timestamp";
import { FormButton } from "../../../components/form/FormButton";
import { FormStatus } from "../../../components/form/FormStatus";
import { authErrorText } from "../errors";
import type { Session } from "../types";
import { ProfileSection } from "./ProfileSection";
import { SESSIONS_KEY, useSessionEnded } from "./useSessionEnded";

function DeviceRow({ session, busy, onEnd }: { session: Session; busy: boolean; onEnd: () => void }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-base p-3 sm:p-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold text-text-bright">
          <span className="break-words">{session.label}</span>
          <span className="text-xs font-normal text-text-muted">{session.kind === "app" ? t("account.profile.devices.app") : t("account.profile.devices.browser")}</span>
          {session.current && <span className="rounded border border-primary-dim px-1.5 text-[10px] font-semibold uppercase text-primary">{t("account.profile.devices.thisDevice")}</span>}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs text-text-muted">
          <span>{t("account.profile.devices.lastUsed")} <Timestamp value={session.lastUsedAt} /></span>
          <span>{t("account.profile.devices.created")} <Timestamp value={session.createdAt} /></span>
        </div>
      </div>
      {/* This device is signed out from the header menu, never from here. */}
      {!session.current && !asking && (
        <FormButton type="button" variant="danger" size="md" busy={busy} busyLabel={t("account.profile.devices.ending")} aria-label={t("account.profile.devices.signOutNamed", { label: session.label })} className="self-start" onClick={() => setAsking(true)}>
          {t("account.profile.devices.signOut")}
        </FormButton>
      )}
      {!session.current && asking && (
        <ConfirmRow
          question={t("account.profile.devices.signOutAsk", { label: session.label })}
          yes={t("account.profile.devices.signOutYes")}
          busy={busy}
          busyLabel={t("account.profile.devices.ending")}
          onYes={onEnd}
          onCancel={() => setAsking(false)}
        />
      )}
    </li>
  );
}

// The in-place confirmation for a destructive action: the question, a solid red yes, an outline cancel.
function ConfirmRow({ question, yes, busy, busyLabel, onYes, onCancel }: { question: string; yes: string; busy: boolean; busyLabel: string; onYes: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
      <span className="text-sm text-text-normal">{question}</span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <FormButton type="button" variant="dangerSolid" size="md" busy={busy} busyLabel={busyLabel} onClick={onYes}>{yes}</FormButton>
        <FormButton type="button" variant="outline" size="md" disabled={busy} onClick={onCancel}>{t("account.requests.cancel")}</FormButton>
      </div>
    </div>
  );
}

export function DevicesSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ended = useSessionEnded();
  const list = useQuery({ queryKey: SESSIONS_KEY, queryFn: () => me.sessions() });
  useEffect(() => {
    if (list.error) ended(list.error);
  }, [list.error, ended]);

  const refetch = () => void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
  const endOne = useSessionMutation({ mutationFn: (id: string) => me.endSession(id), onSuccess: refetch, onError: ended });
  const endOthers = useSessionMutation({ mutationFn: () => me.endOtherSessions(), onSuccess: () => { setAskingOthers(false); refetch(); }, onError: ended });

  const [askingOthers, setAskingOthers] = useState(false);
  const sessions = list.data?.sessions ?? [];
  const hasOthers = sessions.some((s) => !s.current);
  const error = endOne.error ?? endOthers.error;

  return (
    <ProfileSection id="profile-devices" title={t("account.profile.devices.title")} description={t("account.profile.devices.about")}>
      {list.isPending && <FormStatus>{t("account.profile.devices.loading")}</FormStatus>}
      {list.isError && <FormStatus kind="error">{authErrorText(t, list.error)}</FormStatus>}
      {list.data && sessions.length === 0 && <FormStatus>{t("account.profile.devices.empty")}</FormStatus>}
      {sessions.length > 0 && (
        <ul className="flex flex-col gap-3">
          {sessions.map((s) => (
            <DeviceRow key={s.id} session={s} busy={endOne.isPending && endOne.variables === s.id} onEnd={() => endOne.mutate(s.id)} />
          ))}
        </ul>
      )}
      {hasOthers && !askingOthers && (
        <FormButton type="button" variant="danger" size="md" className="self-start" onClick={() => setAskingOthers(true)}>
          {t("account.profile.devices.signOutOthers")}
        </FormButton>
      )}
      {hasOthers && askingOthers && (
        <ConfirmRow
          question={t("account.profile.devices.signOutOthersAsk")}
          yes={t("account.profile.devices.signOutYes")}
          busy={endOthers.isPending}
          busyLabel={t("account.profile.devices.ending")}
          onYes={() => endOthers.mutate()}
          onCancel={() => setAskingOthers(false)}
        />
      )}
      {error != null && <FormStatus kind="error">{authErrorText(t, error)}</FormStatus>}
    </ProfileSection>
  );
}
