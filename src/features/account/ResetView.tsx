import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useSecretSubmit } from "../../hooks/useSessionMutation";
import { auth } from "../../api/auth";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { PasswordField } from "../../components/form/PasswordField";
import { TextField } from "../../components/form/TextField";
import { AccountLayout, LinkButton } from "./AccountLayout";
import { CheckEmail } from "./CheckEmail";
import { authErrorText, errorCode } from "./errors";
import { newPasswordOk, passwordTooLong } from "./passwordRule";
import { linkToken, useClearToken, useView } from "./useView";

export function ResetView() {
  const location = useLocation();
  // Held in state so removing it from the URL does not flip the view into request mode.
  const [token, setToken] = useState(() => linkToken(location));
  const clearToken = useClearToken();
  // The live token leaves the URL (and so history) at once; retries use the copy in memory.
  useEffect(() => {
    if (token) clearToken();
  }, [token, clearToken]);
  return token ? <ConfirmReset token={token} onNewLink={() => setToken(null)} /> : <RequestReset />;
}

function RequestReset() {
  const { t } = useTranslation();
  const { open } = useView();
  const [email, setEmail] = useState("");
  const request = useMutation({ mutationFn: () => auth.requestReset(email.trim()) });
  if (request.isSuccess) return <CheckEmail email={email.trim()} kind="reset" onDifferent={request.reset} onSignIn={() => open("signin")} />;
  return (
    <AccountLayout title={t("account.reset.title")} description={t("account.reset.intro")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          request.mutate();
        }}
      >
        <TextField roomy label={t("account.fields.email")} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="send" value={email} onChange={setEmail} disabled={request.isPending} />
        {request.isError && <FormStatus kind="error">{authErrorText(t, request.error)}</FormStatus>}
        <FormButton variant="solid" size="lg" busy={request.isPending} busyLabel={t("account.reset.sending")} disabled={!email.trim()}>{t("account.reset.send")}</FormButton>
      </form>
      <LinkButton onClick={() => open("signin")}>{t("account.reset.toSignIn")}</LinkButton>
    </AccountLayout>
  );
}

function ConfirmReset({ token, onNewLink }: { token: string; onNewLink: () => void }) {
  const { t } = useTranslation();
  const { open } = useView();
  const [password, setPassword] = useState("");
  const confirm = useSecretSubmit(() => auth.confirmReset(token, password), {
    onSuccess: () => setPassword(""),
  });

  const tooLong = passwordTooLong(password);
  const code = confirm.isError ? errorCode(confirm.error) : undefined;
  const message = confirm.isError ? authErrorText(t, confirm.error) : undefined;

  return (
    <AccountLayout title={t("account.reset.title")} description={confirm.isSuccess || code === "token_invalid" ? undefined : t("account.reset.setIntro")}>
      {confirm.isSuccess ? (
        <div className="flex flex-col gap-4">
          <FormStatus>{t("account.reset.done")}</FormStatus>
          <FormButton type="button" variant="solid" size="lg" onClick={() => open("signin")}>{t("account.reset.signIn")}</FormButton>
        </div>
      ) : code === "token_invalid" ? (
        <div className="flex flex-col gap-4">
          <FormStatus kind="error">{message}</FormStatus>
          <FormButton type="button" variant="outline" size="lg" onClick={onNewLink}>{t("account.reset.newLink")}</FormButton>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate();
          }}
        >
          <PasswordField roomy label={t("account.fields.newPassword")} name="new-password" autoComplete="new-password" enterKeyHint="go" value={password} onChange={setPassword} error={tooLong ? t("account.errors.passwordTooLong") : code === "weak_password" ? message : undefined} hint={tooLong ? undefined : t("account.register.passwordHint")} disabled={confirm.isPending} />
          {confirm.isError && code !== "weak_password" && <FormStatus kind="error">{message}</FormStatus>}
          <FormButton variant="solid" size="lg" busy={confirm.isPending} busyLabel={t("account.reset.setting")} disabled={!newPasswordOk(password)}>{t("account.reset.set")}</FormButton>
        </form>
      )}
    </AccountLayout>
  );
}
