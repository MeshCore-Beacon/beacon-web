import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { auth } from "../../api/auth";
import { useFeatures } from "../../hooks/useFeatures";
import { startSession, useSession } from "../../hooks/useSession";
import { useSecretSubmit } from "../../hooks/useSessionMutation";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { PasswordField } from "../../components/form/PasswordField";
import { TextField } from "../../components/form/TextField";
import { AccountLayout, Divider, LinkButton } from "./AccountLayout";
import { CheckEmail } from "./CheckEmail";
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
  const { view, open, close } = useView();
  const [params] = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const bridge = params.get("app") === "1";
  const challenge = params.get("code_challenge");
  const state = params.get("state");

  const submit = useSecretSubmit(() => auth.login(login.trim(), password), {
    onSuccess: ({ user: signedIn }) => {
      setPassword("");
      startSession(queryClient, signedIn);
    },
  });

  // Covers a login here and a visit while already signed in; embedded in the profile it stays there; the bridge keeps the view for its confirmation.
  useEffect(() => {
    if (user && !bridge && view === "signin") close();
  }, [user, bridge, view, close]);

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

  if (sentTo) return <CheckEmail email={sentTo} kind="verify" onDifferent={() => setSentTo(null)} onSignIn={() => setSentTo(null)} />;

  const description = bridge ? t("account.bridge.notice") : t(descriptionKey(features));

  return (
    <AccountLayout title={t("account.signin.title")} description={description}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <TextField roomy label={t("account.fields.login")} name="login" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} enterKeyHint="next" value={login} onChange={setLogin} disabled={submit.isPending} />
        <div className="flex flex-col gap-1">
          <PasswordField roomy label={t("account.fields.password")} name="password" autoComplete="current-password" enterKeyHint="go" value={password} onChange={setPassword} disabled={submit.isPending} />
          <LinkButton onClick={() => open("reset")}>{t("account.signin.forgot")}</LinkButton>
        </div>
        {submit.isError && <FormStatus kind="error">{authErrorText(t, submit.error)}</FormStatus>}
        <FormButton variant="solid" size="lg" busy={submit.isPending} busyLabel={t("account.signin.submitting")} disabled={!login.trim() || !password}>{t("account.signin.submit")}</FormButton>
      </form>
      {unverified && <ResendForm email={typedEmail} label={t("account.resend.button")} onSent={setSentTo} />}
      {features.registration && (
        <>
          <Divider />
          <FormButton type="button" variant="outline" size="lg" onClick={() => open("register")}>{t("account.signin.register")}</FormButton>
        </>
      )}
    </AccountLayout>
  );
}

// The line lists only what this server has switched on.
function descriptionKey(f: { telemetryRequests: boolean; alerts: boolean }): string {
  if (f.telemetryRequests && f.alerts) return "account.signin.description.all";
  if (f.telemetryRequests) return "account.signin.description.telemetry";
  if (f.alerts) return "account.signin.description.alerts";
  return "account.signin.description.atlas";
}
