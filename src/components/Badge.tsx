import type { ReactNode } from "react";
import { VARIANT_CLASSES, type BadgeVariant } from "./badge-utils";

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider uppercase ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
