import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { me } from "../../../api/auth";
import { useSecretSubmit } from "../../../hooks/useSessionMutation";
import { FormButton } from "../../../components/form/FormButton";
import { FormStatus } from "../../../components/form/FormStatus";
import { PasswordField } from "../../../components/form/PasswordField";
import { newPasswordOk } from "../passwordRule";
import { ProfileSection } from "./ProfileSection";
import { profileErrorText, SESSIONS_KEY, useSessionEnded } from "./useSessionEnded";

export function PasswordSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ended = useSessionEnded();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useSecretSubmit(() => me.changePassword(current, next), {
    onSuccess: () => {
      setCurrent("");
      setNext("");
      // The server ended every other session, so the list is stale.
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
    onError: ended,
  });
  return (
    <ProfileSection id="profile-password" title={t("account.profile.password.title")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <PasswordField label={t("account.profile.currentPassword")} name="currentPassword" autoComplete="current-password" value={current} onChange={setCurrent} disabled={change.isPending} />
        <PasswordField label={t("account.fields.newPassword")} name="newPassword" autoComplete="new-password" hint={t("account.register.passwordHint")} value={next} onChange={setNext} disabled={change.isPending} />
        <FormButton busy={change.isPending} busyLabel={t("account.profile.password.submitting")} disabled={!current || !newPasswordOk(next)} className="self-start">
          {t("account.profile.password.submit")}
        </FormButton>
        {change.isSuccess && <FormStatus>{t("account.profile.password.done")}</FormStatus>}
        {change.isError && <FormStatus kind="error">{profileErrorText(t, change.error)}</FormStatus>}
      </form>
    </ProfileSection>
  );
}
