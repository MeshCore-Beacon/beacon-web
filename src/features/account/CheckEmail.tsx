import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { auth } from "../../api/auth";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { AccountLayout, Divider, LinkButton } from "./AccountLayout";
import { authErrorText } from "./errors";

export const RESEND_COOLDOWN_S = 60;

// Names the address typed but never says whether it is registered.
export function CheckEmail({ email, kind, onDifferent, onSignIn }: { email: string; kind: "verify" | "reset"; onDifferent: () => void; onSignIn: () => void }) {
  const { t } = useTranslation();
  // A mail was just sent, so the cooldown starts now.
  const [left, setLeft] = useState(RESEND_COOLDOWN_S);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  const resend = useMutation({
    mutationFn: () => (kind === "reset" ? auth.requestReset(email) : auth.resendVerification(email)),
    onSuccess: () => setLeft(RESEND_COOLDOWN_S),
  });

  return (
    <AccountLayout title={t("account.checkEmail.title")} description={t(kind === "reset" ? "account.checkEmail.resetSent" : "account.checkEmail.verifySent", { email })}>
      <div className="flex flex-col gap-4">
        {resend.isSuccess && <FormStatus>{t("account.checkEmail.resent")}</FormStatus>}
        {resend.isError && <FormStatus kind="error">{authErrorText(t, resend.error)}</FormStatus>}
        <FormButton
          type="button"
          variant="outline"
          size="lg"
          busy={resend.isPending}
          disabled={left > 0}
          onClick={() => resend.mutate()}
        >
          {left > 0 ? t("account.checkEmail.resendIn", { seconds: left }) : t("account.checkEmail.resend")}
        </FormButton>
      </div>
      <Divider />
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <LinkButton onClick={onDifferent}>{t("account.checkEmail.different")}</LinkButton>
        <LinkButton onClick={onSignIn}>{t("account.checkEmail.signIn")}</LinkButton>
      </div>
    </AccountLayout>
  );
}
