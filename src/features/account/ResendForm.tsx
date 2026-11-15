import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { auth } from "../../api/auth";
import { FormButton } from "../../components/form/FormButton";
import { FormStatus } from "../../components/form/FormStatus";
import { TextField } from "../../components/form/TextField";
import { authErrorText } from "./errors";

// Asks for a fresh verification link. With a known address it is just the button; on success the caller shows Check your email.
export function ResendForm({ email, label, variant = "outline", onSent }: { email?: string; label: string; variant?: "solid" | "outline"; onSent: (address: string) => void }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const address = email ?? typed.trim();
  const resend = useMutation({ mutationFn: () => auth.resendVerification(address), onSuccess: () => onSent(address) });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (address) resend.mutate();
      }}
    >
      {email === undefined && (
        <TextField roomy label={t("account.fields.email")} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="send" value={typed} onChange={setTyped} />
      )}
      <FormButton size="lg" variant={variant} busy={resend.isPending} disabled={!address}>{label}</FormButton>
      <div className="min-h-5">{resend.isError && <FormStatus kind="error">{authErrorText(t, resend.error)}</FormStatus>}</div>
    </form>
  );
}
