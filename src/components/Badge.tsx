import type { ReactNode } from "react";
import { VARIANT_CLASSES, type BadgeVariant } from "./badge-utils";

export function Badge({ variant, children, normalCase = false }: { variant: BadgeVariant; children: ReactNode; normalCase?: boolean }) {
  return (
    <span
      className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider ${normalCase ? "" : "uppercase "}${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
