import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TextField, type TextFieldProps } from "./TextField";

export type PasswordFieldProps = Omit<TextFieldProps, "type" | "trailing" | "autoComplete"> & {
  autoComplete: "current-password" | "new-password" | "off";
};

export function PasswordField(props: PasswordFieldProps) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <TextField
      {...props}
      type={shown ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          disabled={props.disabled}
          aria-label={shown ? t("common.hidePassword") : t("common.showPassword")}
          className={`absolute rounded font-mono text-xs font-semibold text-primary hover:text-text-bright ${props.roomy ? "right-0 h-11 min-w-11 px-3" : "right-1.5 px-1.5 py-0.5"}`}
        >
          {shown ? t("common.hide") : t("common.show")}
        </button>
      }
    />
  );
}
