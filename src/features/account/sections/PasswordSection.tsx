import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { me } from "../../../api/auth";
import { useSecretSubmit } from "../../../hooks/useSessionMutation";
import { FormButton } from "../../../components/form/FormButton";
import { FormStatus } from "../../../components/form/FormStatus";
import { PasswordField } from "../../../components/form/PasswordField";
import { newPasswordOk, passwordTooLong } from "../passwordRule";
import { ProfileSection } from "./ProfileSection";
import { useFlash } from "./useFlash";
import { profileErrorText, SESSIONS_KEY, useSessionEnded } from "./useSessionEnded";

export function PasswordSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ended = useSessionEnded();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const flash = useFlash(8000);
  const change = useSecretSubmit(() => me.changePassword(current, next), {
    onSuccess: () => {
      setCurrent("");
      setNext("");
      flash.show();
      // The server ended every other session, so the list is stale.
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
    onError: ended,
  });
  const tooLong = passwordTooLong(next);
  return (
    <ProfileSection id="profile-password" title={t("account.profile.password.title")} description={t("account.profile.password.about")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <PasswordField roomy label={t("account.profile.currentPassword")} name="currentPassword" autoComplete="current-password" value={current} onChange={(v) => { setCurrent(v); flash.hide(); }} disabled={change.isPending} />
        <PasswordField roomy label={t("account.fields.newPassword")} name="newPassword" autoComplete="new-password" hint={tooLong ? undefined : t("account.register.passwordHint")} error={tooLong ? t("account.errors.passwordTooLong") : undefined} value={next} onChange={(v) => { setNext(v); flash.hide(); }} disabled={change.isPending} />
        <FormButton variant="solid" size="lg" busy={change.isPending} busyLabel={t("account.profile.password.submitting")} disabled={!current || !newPasswordOk(next)} className="sm:w-auto sm:self-start sm:px-8">
          {t("account.profile.password.submit")}
        </FormButton>
        {flash.on && <FormStatus>{t("account.profile.password.done")}</FormStatus>}
        {change.isError && <FormStatus kind="error">{profileErrorText(t, change.error)}</FormStatus>}
      </form>
    </ProfileSection>
  );
}
