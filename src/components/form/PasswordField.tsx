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
          className="absolute right-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-primary"
        >
          {shown ? t("common.hidePassword") : t("common.showPassword")}
        </button>
      }
    />
  );
}
