import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface FormButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
  busyLabel?: ReactNode;
}

export function FormButton({ busy, busyLabel, disabled, type = "submit", className, children, ...rest }: FormButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy ? true : undefined}
      className={`rounded border border-primary-dim bg-primary/10 px-3 py-1.5 font-mono text-xs font-semibold text-primary hover:bg-primary/15 disabled:opacity-60${className ? ` ${className}` : ""}`}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
