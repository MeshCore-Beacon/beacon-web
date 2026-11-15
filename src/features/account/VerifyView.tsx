import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth } from "../../api/auth";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { AccountLayout } from "./AccountLayout";
import { authErrorText, errorCode } from "./errors";
import { ResendForm } from "./ResendForm";
import { useClearToken, useView } from "./useView";

type State = { kind: "pending" } | { kind: "verified" } | { kind: "failed"; error: unknown };

export function VerifyView() {
  const { t } = useTranslation();
  const { open } = useView();
  const clearToken = useClearToken();
  const [params] = useSearchParams();
  // Held in state: the URL copy is removed once used.
  const [token] = useState(() => params.get("token"));
  const [state, setState] = useState<State>({ kind: "pending" });
  const started = useRef(false);

  // A ref guards the post: strict mode runs this effect twice, and a one-time token must be sent once.
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    auth.verify(token).then(
      () => {
        setState({ kind: "verified" });
        clearToken();
      },
      (error: unknown) => setState({ kind: "failed", error }),
    );
  }, [token, clearToken]);

  const invalid = !token || (state.kind === "failed" && errorCode(state.error) === "token_invalid");

  return (
    <AccountLayout title={t("account.verify.title")}>
      {state.kind === "verified" ? (
        <>
          <FormStatus>{t("account.verify.success")}</FormStatus>
          <FormButton type="button" className="self-start" onClick={() => open("signin")}>{t("account.verify.signIn")}</FormButton>
        </>
      ) : invalid ? (
        <>
          <FormStatus kind="error">{t("account.errors.token_invalid")}</FormStatus>
          <p className="text-sm text-text-muted">{t("account.verify.newLinkHelp")}</p>
          <ResendForm label={t("account.verify.newLink")} />
        </>
      ) : state.kind === "failed" ? (
        <FormStatus kind="error">{authErrorText(t, state.error)}</FormStatus>
      ) : (
        <FormStatus>{t("account.verify.checking")}</FormStatus>
      )}
    </AccountLayout>
  );
}
