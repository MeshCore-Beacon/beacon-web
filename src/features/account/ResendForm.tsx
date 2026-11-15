import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { auth } from "../../api/auth";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { TextField } from "../../components/form/TextField";
import { authErrorText } from "./errors";

// Asks for a fresh verification link. With a known address it is just the button.
export function ResendForm({ email, label }: { email?: string; label: string }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const address = email ?? typed.trim();
  const resend = useMutation({ mutationFn: () => auth.resendVerification(address) });

  if (resend.isSuccess) return <FormStatus>{t("account.resend.sent")}</FormStatus>;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (address) resend.mutate();
      }}
    >
      {email === undefined && (
        <TextField label={t("account.fields.email")} name="email" type="email" autoComplete="email" value={typed} onChange={setTyped} />
      )}
      <FormButton busy={resend.isPending} disabled={!address} className="self-start">{label}</FormButton>
      {resend.isError && <FormStatus kind="error">{authErrorText(t, resend.error)}</FormStatus>}
    </form>
  );
}
