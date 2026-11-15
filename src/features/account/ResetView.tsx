import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { auth } from "../../api/auth";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { PasswordField } from "../../components/form/PasswordField";
import { TextField } from "../../components/form/TextField";
import { AccountLayout, LinkButton } from "./AccountLayout";
import { authErrorText, errorCode } from "./errors";
import { useClearToken, useView } from "./useView";

export function ResetView() {
  const [params] = useSearchParams();
  // Held in state so removing it from the URL after use does not flip the view into request mode.
  const [token, setToken] = useState(() => params.get("token"));
  return token ? <ConfirmReset token={token} onNewLink={() => setToken(null)} /> : <RequestReset />;
}

function RequestReset() {
  const { t } = useTranslation();
  const { open } = useView();
  const [email, setEmail] = useState("");
  const request = useMutation({ mutationFn: () => auth.requestReset(email.trim()) });
  return (
    <AccountLayout title={t("account.reset.title")} links={<LinkButton onClick={() => open("signin")}>{t("account.reset.toSignIn")}</LinkButton>}>
      {request.isSuccess ? (
        <FormStatus>{t("account.reset.sent")}</FormStatus>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate();
          }}
        >
          <p className="text-sm text-text-muted">{t("account.reset.intro")}</p>
          <TextField label={t("account.fields.email")} name="email" type="email" autoComplete="email" value={email} onChange={setEmail} disabled={request.isPending} />
          <FormButton busy={request.isPending} busyLabel={t("account.reset.sending")} disabled={!email.trim()}>{t("account.reset.send")}</FormButton>
          {request.isError && <FormStatus kind="error">{authErrorText(t, request.error)}</FormStatus>}
        </form>
      )}
    </AccountLayout>
  );
}

function ConfirmReset({ token, onNewLink }: { token: string; onNewLink: () => void }) {
  const { t } = useTranslation();
  const { open } = useView();
  const clearToken = useClearToken();
  const [password, setPassword] = useState("");
  const confirm = useMutation({
    mutationFn: () => auth.confirmReset(token, password),
    onSuccess: () => {
      setPassword("");
      clearToken();
    },
  });

  const code = confirm.isError ? errorCode(confirm.error) : undefined;
  const message = confirm.isError ? authErrorText(t, confirm.error) : undefined;

  return (
    <AccountLayout title={t("account.reset.title")}>
      {confirm.isSuccess ? (
        <>
          <FormStatus>{t("account.reset.done")}</FormStatus>
          <FormButton type="button" className="self-start" onClick={() => open("signin")}>{t("account.reset.signIn")}</FormButton>
        </>
      ) : code === "token_invalid" ? (
        <>
          <FormStatus kind="error">{message}</FormStatus>
          <LinkButton onClick={() => { clearToken(); onNewLink(); }}>{t("account.reset.newLink")}</LinkButton>
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate();
          }}
        >
          <PasswordField label={t("account.fields.newPassword")} name="new-password" autoComplete="new-password" value={password} onChange={setPassword} error={code === "weak_password" ? message : undefined} hint={t("account.register.passwordHint")} disabled={confirm.isPending} />
          <FormButton busy={confirm.isPending} busyLabel={t("account.reset.setting")} disabled={!password}>{t("account.reset.set")}</FormButton>
          {confirm.isError && code !== "weak_password" && <FormStatus kind="error">{message}</FormStatus>}
        </form>
      )}
    </AccountLayout>
  );
}
