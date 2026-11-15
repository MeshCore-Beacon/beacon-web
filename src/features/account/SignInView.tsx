import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { auth } from "../../api/auth";
import { useFeatures } from "../../hooks/useFeatures";
import { setSessionUser, useSession } from "../../hooks/useSession";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { PasswordField } from "../../components/form/PasswordField";
import { TextField } from "../../components/form/TextField";
import { AccountLayout, LinkButton } from "./AccountLayout";
import { AppBridge } from "./AppBridge";
import { authErrorText, errorCode } from "./errors";
import { PortalSignIn } from "./PortalSignIn";
import { ResendForm } from "./ResendForm";
import { useView } from "./useView";
import { useSearchParams } from "react-router-dom";

export function SignInView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const features = useFeatures();
  const { user, loading } = useSession();
  const { open, close } = useView();
  const [params] = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  const bridge = params.get("app") === "1";
  const challenge = params.get("code_challenge");
  const state = params.get("state");

  const submit = useMutation({
    mutationFn: () => auth.login(login.trim(), password),
    onSuccess: ({ user: signedIn }) => {
      setPassword("");
      setSessionUser(queryClient, signedIn);
    },
  });

  // Covers a login here and a visit while already signed in; the bridge keeps the view for its confirmation.
  useEffect(() => {
    if (user && !bridge) close();
  }, [user, bridge, close]);

  if (loading) return <div className="mx-auto w-full max-w-[420px] px-4 py-8"><FormStatus>{t("common.loading")}</FormStatus></div>;

  if (bridge && !(challenge && state)) {
    return (
      <AccountLayout title={t("account.signin.title")}>
        <FormStatus kind="error">{t("account.bridge.incomplete")}</FormStatus>
      </AccountLayout>
    );
  }
  if (bridge && user && challenge && state) {
    return <AppBridge user={user} codeChallenge={challenge} state={state} />;
  }

  if (features.accounts === "portal") return <PortalSignIn />;

  const unverified = submit.isError && errorCode(submit.error) === "email_unverified";
  const typedEmail = login.includes("@") ? login.trim() : undefined;

  return (
    <AccountLayout
      title={t("account.signin.title")}
      links={
        <>
          {features.registration && <LinkButton onClick={() => open("register")}>{t("account.signin.register")}</LinkButton>}
          <LinkButton onClick={() => open("reset")}>{t("account.signin.forgot")}</LinkButton>
        </>
      }
    >
      {bridge && <FormStatus>{t("account.bridge.notice")}</FormStatus>}
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <TextField label={t("account.fields.login")} name="login" autoComplete="username" value={login} onChange={setLogin} disabled={submit.isPending} />
        <PasswordField label={t("account.fields.password")} name="password" autoComplete="current-password" value={password} onChange={setPassword} disabled={submit.isPending} />
        <FormButton busy={submit.isPending} busyLabel={t("account.signin.submitting")} disabled={!login.trim() || !password}>{t("account.signin.submit")}</FormButton>
        {submit.isError && <FormStatus kind="error">{authErrorText(t, submit.error)}</FormStatus>}
      </form>
      {unverified && <ResendForm email={typedEmail} label={t("account.resend.button")} />}
    </AccountLayout>
  );
}
