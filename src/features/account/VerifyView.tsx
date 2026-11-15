import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth } from "../../api/auth";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { AccountLayout } from "./AccountLayout";
import { authErrorText, errorCode } from "./errors";
import { CheckEmail } from "./CheckEmail";
import { ResendForm } from "./ResendForm";
import { linkToken, useClearToken, useView } from "./useView";

type State = { kind: "pending" } | { kind: "verified" } | { kind: "failed"; error: unknown };

export function VerifyView() {
  const { t } = useTranslation();
  const { open } = useView();
  const clearToken = useClearToken();
  const location = useLocation();
  // Held in state: the URL copy is removed at once.
  const [token] = useState(() => linkToken(location));
  const [state, setState] = useState<State>({ kind: "pending" });
  const [sentTo, setSentTo] = useState<string | null>(null);
  const started = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // A ref guards the post: strict mode runs this effect twice, and a one-time token must be sent once.
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    clearToken();
    // A view that was left meanwhile has nothing to show and must not touch the URL.
    auth.verify(token).then(
      () => { if (mounted.current) setState({ kind: "verified" }); },
      (error: unknown) => { if (mounted.current) setState({ kind: "failed", error }); },
    );
  }, [token, clearToken]);

  const invalid = !token || (state.kind === "failed" && errorCode(state.error) === "token_invalid");

  if (sentTo) return <CheckEmail email={sentTo} kind="verify" onDifferent={() => setSentTo(null)} onSignIn={() => open("signin")} />;

  return (
    <AccountLayout title={t("account.verify.title")}>
      {state.kind === "verified" ? (
        <div className="flex flex-col gap-4">
          <FormStatus>{t("account.verify.success")}</FormStatus>
          <FormButton type="button" variant="solid" size="lg" onClick={() => open("signin")}>{t("account.verify.signIn")}</FormButton>
        </div>
      ) : invalid ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <FormStatus kind="error">{t("account.errors.token_invalid")}</FormStatus>
            <p className="text-sm text-text-muted">{t("account.verify.newLinkHelp")}</p>
          </div>
          <ResendForm variant="solid" label={t("account.verify.newLink")} onSent={setSentTo} />
        </div>
      ) : state.kind === "failed" ? (
        <FormStatus kind="error">{authErrorText(t, state.error)}</FormStatus>
      ) : (
        <FormStatus>{t("account.verify.checking")}</FormStatus>
      )}
    </AccountLayout>
  );
}
