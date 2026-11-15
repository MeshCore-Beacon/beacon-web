import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface FormButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
  busyLabel?: ReactNode;
  variant?: "primary" | "quiet" | "danger";
}

const VARIANT = {
  primary: "border-primary-dim bg-primary/10 text-primary hover:bg-primary/15",
  quiet: "border-border bg-bg-raised text-text-muted hover:border-text-dim hover:text-text-normal",
  danger: "border-danger text-danger hover:bg-danger/10",
} as const;

export function FormButton({ busy, busyLabel, variant = "primary", disabled, type = "submit", className, children, ...rest }: FormButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy ? true : undefined}
      className={`rounded border ${VARIANT[variant]} px-3 py-1.5 font-mono text-xs font-semibold disabled:opacity-60${className ? ` ${className}` : ""}`}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
