import type { ReactNode } from "react";

export function FormStatus({ kind = "info", children }: { kind?: "info" | "error"; children?: ReactNode }) {
  if (!children) return null;
  return kind === "error"
    ? <p role="alert" className="text-sm text-danger">{children}</p>
    : <p role="status" className="text-sm text-text-muted">{children}</p>;
}
