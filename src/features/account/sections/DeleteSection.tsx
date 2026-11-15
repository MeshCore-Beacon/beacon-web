import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { me } from "../../../api/auth";
import { useFeatures } from "../../../hooks/useFeatures";
import { clearSession } from "../../../hooks/useSession";
import { FormButton } from "../../../components/form/FormButton";
import { FormStatus } from "../../../components/form/FormStatus";
import { PasswordField } from "../../../components/form/PasswordField";
import { TextField } from "../../../components/form/TextField";
import type { User } from "../types";
import { useView } from "../useView";
import { ProfileSection } from "./ProfileSection";
import { profileErrorText, useSessionEnded } from "./useSessionEnded";

export function DeleteSection({ user }: { user: User }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { close } = useView();
  const ended = useSessionEnded();
  // Portal accounts have no password, so the typed username is the confirmation.
  const portal = useFeatures().accounts === "portal";
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => me.deleteAccount(portal ? { confirmUsername: typed } : password),
    onSuccess: () => {
      setPassword("");
      clearSession(queryClient);
      close();
    },
    onError: ended,
  });

  const cancel = () => {
    setConfirming(false);
    setTyped("");
    remove.reset();
  };

  return (
    <ProfileSection id="profile-delete" title={t("account.profile.delete.title")}>
      <p className="text-sm text-text-normal">{t("account.profile.delete.explain")}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirming) setConfirming(true);
          else if (typed === user.username) remove.mutate();
        }}
      >
        {!portal && <PasswordField label={t("account.profile.currentPassword")} name="deletePassword" autoComplete="current-password" value={password} onChange={setPassword} disabled={remove.isPending} />}
        {confirming ? (
          <>
            <TextField label={t("account.profile.delete.typeUsername", { username: user.username })} name="confirmUsername" autoComplete="off" value={typed} onChange={setTyped} disabled={remove.isPending} />
            <div className="flex gap-3">
              <FormButton variant="danger" busy={remove.isPending} busyLabel={t("account.profile.delete.deleting")} disabled={typed !== user.username || (!portal && !password)}>
                {t("account.profile.delete.confirm")}
              </FormButton>
              <FormButton type="button" variant="quiet" disabled={remove.isPending} onClick={cancel}>{t("account.profile.delete.cancel")}</FormButton>
            </div>
          </>
        ) : (
          <FormButton variant="danger" disabled={!portal && !password} className="self-start">{t("account.profile.delete.start")}</FormButton>
        )}
        {remove.isError && <FormStatus kind="error">{profileErrorText(t, remove.error)}</FormStatus>}
      </form>
    </ProfileSection>
  );
}
