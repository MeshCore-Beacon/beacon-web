import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface FormButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  busy?: boolean;
  busyLabel?: ReactNode;
  // solid and outline are the account screens' pair; the others keep the in-page look.
  variant?: "primary" | "quiet" | "danger" | "solid" | "outline" | "dangerSolid";
  // lg: full width, 44 px tall. md: auto width, 44 px tall on phones and 36 px from sm up.
  size?: "lg" | "md";
}

const VARIANT = {
  primary: "border-primary-dim bg-primary/10 text-primary hover:bg-primary/15 disabled:opacity-60",
  quiet: "border-border bg-bg-raised text-text-muted hover:border-text-dim hover:text-text-normal disabled:opacity-60",
  danger: "border-danger text-danger hover:bg-danger/10 disabled:opacity-60",
  // text-bg-base reads on the accent in every theme: dark on bright accents, light on the dark one.
  solid: "border-primary bg-primary text-bg-base hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-raised disabled:text-text-dim",
  dangerSolid: "border-danger bg-danger text-bg-base hover:bg-danger/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-raised disabled:text-text-dim",
  outline: "border-border bg-transparent text-text-bright hover:border-text-dim hover:bg-bg-raised disabled:cursor-not-allowed disabled:text-text-dim",
} as const;

// While busy a solid button stays filled (it is working, not unavailable).
const BUSY_SOLID = "cursor-progress border-primary bg-primary text-bg-base opacity-80";

const BUSY_DANGER = "cursor-progress border-danger bg-danger text-bg-base opacity-80";

function Spinner() {
  return <span aria-hidden className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />;
}

export function FormButton({ busy, busyLabel, variant = "primary", size, disabled, type = "submit", className, children, ...rest }: FormButtonProps) {
  const solidLike = variant === "solid" || variant === "dangerSolid";
  const look = busy && solidLike ? (variant === "solid" ? BUSY_SOLID : BUSY_DANGER) : VARIANT[variant];
  const sizing = size === "lg" ? "min-h-11 w-full px-4 py-2 text-sm" : size === "md" ? "min-h-11 px-4 py-2 text-sm sm:min-h-9 sm:px-3.5 sm:py-1.5 sm:text-xs" : "px-3 py-1.5 text-xs";
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy ? true : undefined}
      className={`inline-flex items-center justify-center rounded border ${look} ${sizing} font-mono font-semibold${className ? ` ${className}` : ""}`}
    >
      {busy && size && <Spinner />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
