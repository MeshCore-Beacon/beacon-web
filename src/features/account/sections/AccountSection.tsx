import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { me } from "../../../api/auth";
import { setSessionUser } from "../../../hooks/useSession";
import { FormButton } from "../../../components/form/FormButton";
import { FormStatus } from "../../../components/form/FormStatus";
import { PasswordField } from "../../../components/form/PasswordField";
import { TextField } from "../../../components/form/TextField";
import { authErrorText } from "../errors";
import type { User } from "../types";
import { ProfileSection } from "./ProfileSection";
import { profileErrorText, useSessionEnded } from "./useSessionEnded";

function DisplayNameForm({ user }: { user: User }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ended = useSessionEnded();
  const [name, setName] = useState(user.displayName);
  const save = useMutation({
    mutationFn: () => me.setDisplayName(name.trim()),
    onSuccess: ({ user: updated }) => {
      setName(updated.displayName);
      setSessionUser(queryClient, updated);
    },
    onError: ended,
  });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <TextField label={t("account.profile.account.displayName")} name="displayName" autoComplete="nickname" maxLength={40} value={name} onChange={setName} disabled={save.isPending} />
      <FormButton busy={save.isPending} busyLabel={t("account.profile.account.saving")} disabled={!name.trim() || name.trim() === user.displayName} className="self-start">
        {t("account.profile.account.save")}
      </FormButton>
      {save.isSuccess && <FormStatus>{t("account.profile.account.saved")}</FormStatus>}
      {save.isError && <FormStatus kind="error">{authErrorText(t, save.error)}</FormStatus>}
    </form>
  );
}

function ChangeEmailForm({ user }: { user: User }) {
  const { t } = useTranslation();
  const ended = useSessionEnded();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (address: string) => me.changeEmail(address, password),
    onSuccess: (_, address) => {
      setSent(address);
      setEmail("");
      setPassword("");
    },
    onError: ended,
  });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate(email.trim());
      }}
    >
      <TextField label={t("account.profile.account.newEmail")} name="newEmail" type="email" autoComplete="email" value={email} onChange={setEmail} disabled={change.isPending} />
      <PasswordField label={t("account.profile.currentPassword")} name="emailPassword" autoComplete="current-password" value={password} onChange={setPassword} disabled={change.isPending} />
      <FormButton busy={change.isPending} busyLabel={t("account.profile.account.sending")} disabled={!email.trim() || !password} className="self-start">
        {t("account.profile.account.sendLink")}
      </FormButton>
      {sent ? (
        <FormStatus>{t("account.profile.account.checkEmail", { email: sent })}</FormStatus>
      ) : (
        user.pendingEmail && <FormStatus>{t("account.profile.account.pending", { email: user.pendingEmail })}</FormStatus>
      )}
      {change.isError && <FormStatus kind="error">{profileErrorText(t, change.error)}</FormStatus>}
    </form>
  );
}

export function AccountSection({ user }: { user: User }) {
  const { t } = useTranslation();
  return (
    <ProfileSection id="profile-account" title={t("account.profile.account.title")}>
      <dl className="flex flex-col gap-3 font-mono text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{t("account.profile.account.username")}</dt>
          <dd className="text-text-normal">@{user.username}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{t("account.profile.account.email")}</dt>
          <dd className="flex flex-wrap items-center gap-2 text-text-normal">
            <span className="break-all">{user.email}</span>
            <span className={user.emailVerified ? "text-xs text-green" : "text-xs text-warn"}>
              {user.emailVerified ? t("account.profile.account.verified") : t("account.profile.account.unverified")}
            </span>
          </dd>
        </div>
      </dl>
      <DisplayNameForm user={user} />
      <ChangeEmailForm user={user} />
    </ProfileSection>
  );
}
