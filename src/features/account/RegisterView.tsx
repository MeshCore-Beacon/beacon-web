import { useState } from "react";
import { useTranslation } from "react-i18next";
import { auth } from "../../api/auth";
import { useFeatures } from "../../hooks/useFeatures";
import { useSecretSubmit } from "../../hooks/useSessionMutation";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { PasswordField } from "../../components/form/PasswordField";
import { TextField } from "../../components/form/TextField";
import { AccountLayout, Divider, QuietLine } from "./AccountLayout";
import { CheckEmail } from "./CheckEmail";
import { authErrorText, errorCode } from "./errors";
import { newPasswordOk, passwordTooLong } from "./passwordRule";
import { useView } from "./useView";

type Field = "username" | "email" | "password";

// invalid_input carries no field, so go by what the server's message names.
function fieldFor(err: unknown): Field | null {
  const code = errorCode(err);
  if (code === "username_taken") return "username";
  if (code === "weak_password") return "password";
  if (code === "invalid_input") {
    const message = String((err as { message?: unknown }).message ?? "").toLowerCase();
    return (["username", "email", "password"] as const).find((f) => message.includes(f)) ?? null;
  }
  return null;
}

export function RegisterView() {
  const { t } = useTranslation();
  const features = useFeatures();
  const { open } = useView();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = useSecretSubmit(() => auth.register({ username: username.trim(), email: email.trim(), password }), {
    onSuccess: () => setPassword(""),
  });

  const toSignIn = <QuietLine text={t("account.register.havePrompt")} action={t("account.register.signInLink")} onAction={() => open("signin")} />;

  if (!features.registration) {
    return (
      <AccountLayout title={t("account.register.title")}>
        <FormStatus>{t("account.register.closed")}</FormStatus>
        <Divider />
        {toSignIn}
      </AccountLayout>
    );
  }
  if (submit.isSuccess) {
    return <CheckEmail email={email.trim()} kind="verify" onDifferent={submit.reset} onSignIn={() => open("signin")} />;
  }

  const tooLong = passwordTooLong(password);
  const failedField = submit.isError ? fieldFor(submit.error) : null;
  const message = submit.isError ? authErrorText(t, submit.error) : undefined;
  const fieldError = (f: Field) => (failedField === f ? message : undefined);

  return (
    <AccountLayout title={t("account.register.title")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <TextField roomy label={t("account.fields.username")} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} enterKeyHint="next" value={username} onChange={setUsername} error={fieldError("username")} hint={t("account.register.usernameHint")} disabled={submit.isPending} />
        <TextField roomy label={t("account.fields.email")} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" value={email} onChange={setEmail} error={fieldError("email")} disabled={submit.isPending} />
        <PasswordField roomy label={t("account.fields.password")} name="password" autoComplete="new-password" enterKeyHint="go" value={password} onChange={setPassword} error={tooLong ? t("account.errors.passwordTooLong") : fieldError("password")} hint={tooLong ? undefined : t("account.register.passwordHint")} disabled={submit.isPending} />
        {submit.isError && !failedField && <FormStatus kind="error">{message}</FormStatus>}
        <FormButton variant="solid" size="lg" busy={submit.isPending} busyLabel={t("account.register.submitting")} disabled={!username.trim() || !email.trim() || !newPasswordOk(password)}>{t("account.register.submit")}</FormButton>
      </form>
      {toSignIn}
    </AccountLayout>
  );
}
