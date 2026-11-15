import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 font-mono text-sm text-text-bright">
          <span className="break-words">{session.label}</span>
          <span className="text-xs text-text-muted">{session.kind === "app" ? t("account.profile.devices.app") : t("account.profile.devices.browser")}</span>
          {session.current && <span className="rounded border border-primary-dim px-1.5 text-[10px] font-semibold uppercase text-primary">{t("account.profile.devices.thisDevice")}</span>}
        </div>
        <div className="flex flex-wrap gap-x-4 font-mono text-xs text-text-muted">
          <span>{t("account.profile.devices.lastUsed")} <Timestamp value={session.lastUsedAt} /></span>
          <span>{t("account.profile.devices.created")} <Timestamp value={session.createdAt} /></span>
        </div>
      </div>
      {/* This device is signed out from the header menu, never from here. */}
      {!session.current && (
        <FormButton type="button" variant="quiet" busy={busy} busyLabel={t("account.profile.devices.ending")} aria-label={t("account.profile.devices.signOutNamed", { label: session.label })} onClick={onEnd}>
          {t("account.profile.devices.signOut")}
        </FormButton>
      )}
    </li>
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
  const endOne = useMutation({ mutationFn: (id: string) => me.endSession(id), onSuccess: refetch, onError: ended });
  const endOthers = useMutation({ mutationFn: () => me.endOtherSessions(), onSuccess: refetch, onError: ended });

  const sessions = list.data?.sessions ?? [];
  const hasOthers = sessions.some((s) => !s.current);
  const error = endOne.error ?? endOthers.error;

  return (
    <ProfileSection id="profile-devices" title={t("account.profile.devices.title")}>
      {list.isPending && <FormStatus>{t("account.profile.devices.loading")}</FormStatus>}
      {list.isError && <FormStatus kind="error">{authErrorText(t, list.error)}</FormStatus>}
      {list.data && sessions.length === 0 && <FormStatus>{t("account.profile.devices.empty")}</FormStatus>}
      {sessions.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {sessions.map((s) => (
            <DeviceRow key={s.id} session={s} busy={endOne.isPending && endOne.variables === s.id} onEnd={() => endOne.mutate(s.id)} />
          ))}
        </ul>
      )}
      {hasOthers && (
        <FormButton type="button" variant="quiet" busy={endOthers.isPending} busyLabel={t("account.profile.devices.ending")} className="self-start" onClick={() => endOthers.mutate()}>
          {t("account.profile.devices.signOutOthers")}
        </FormButton>
      )}
      {error != null && <FormStatus kind="error">{authErrorText(t, error)}</FormStatus>}
    </ProfileSection>
  );
}
