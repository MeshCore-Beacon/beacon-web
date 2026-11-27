import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { me } from "../../../api/auth";
import { setSessionUser } from "../../../hooks/useSession";
import { useSecretSubmit, useSessionMutation } from "../../../hooks/useSessionMutation";
import { FormButton } from "../../../components/form/FormButton";
import { FormStatus } from "../../../components/form/FormStatus";
import { PasswordField } from "../../../components/form/PasswordField";
import { TextField } from "../../../components/form/TextField";
import { authErrorText } from "../errors";
import type { User } from "../types";
import { ProfileSection, SubHeading } from "./ProfileSection";
import { profileErrorText, useSessionEnded } from "./useSessionEnded";
import { useFlash } from "./useFlash";

function DisplayNameForm({ user }: { user: User }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ended = useSessionEnded();
  const [name, setName] = useState(user.displayName);
  const flash = useFlash();
  const save = useSessionMutation({
    mutationFn: () => me.setDisplayName(name.trim()),
    onSuccess: ({ user: updated }) => {
      setName(updated.displayName);
      setSessionUser(queryClient, updated);
      flash.show();
    },
    onError: ended,
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <TextField roomy label={t("account.profile.account.displayName")} name="displayName" autoComplete="nickname" maxLength={40} hint={t("account.profile.account.displayNameHint")} value={name} onChange={(v) => { setName(v); flash.hide(); }} disabled={save.isPending} />
      <FormButton variant="solid" size="lg" busy={save.isPending} busyLabel={t("account.profile.account.saving")} disabled={!name.trim() || name.trim() === user.displayName} className="sm:w-auto sm:self-start sm:px-8">
        {t("account.profile.account.save")}
      </FormButton>
      {flash.on && <FormStatus>{t("account.profile.account.saved")}</FormStatus>}
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
  const change = useSecretSubmit((address: string) => me.changeEmail(address, password), {
    onSuccess: (_, address) => {
      setSent(address);
      setEmail("");
      setPassword("");
    },
    onError: ended,
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate(email.trim());
      }}
    >
      <TextField roomy label={t("account.profile.account.newEmail")} name="newEmail" type="email" autoComplete="email" value={email} onChange={setEmail} disabled={change.isPending} />
      <PasswordField roomy label={t("account.profile.currentPassword")} name="emailPassword" hint={t("account.profile.account.passwordHint")} autoComplete="current-password" value={password} onChange={setPassword} disabled={change.isPending} />
      <FormButton variant="solid" size="lg" busy={change.isPending} busyLabel={t("account.profile.account.sending")} disabled={!/^\S+@\S+$/.test(email.trim()) || !password} className="sm:w-auto sm:self-start sm:px-8">
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

export function AccountSection({ user, portal }: { user: User; portal?: boolean }) {
  const { t } = useTranslation();
  return (
    <ProfileSection id="profile-account" title={t("account.profile.account.title")} description={t(portal ? "account.profile.account.aboutPortal" : "account.profile.account.about")}>
      <DisplayNameForm user={user} />
      {!portal && (
        <div className="flex flex-col gap-4 border-t border-border-subtle pt-5">
          <SubHeading>{t("account.profile.account.changeEmail")}</SubHeading>
          <ChangeEmailForm user={user} />
        </div>
      )}
    </ProfileSection>
  );
}
