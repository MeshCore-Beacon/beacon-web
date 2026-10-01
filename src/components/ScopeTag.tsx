import type { ReactNode } from "react";
import { VARIANT_CLASSES } from "./badge-utils";

// Small secondary chip marking a transport scope, shared across packet rows, the analyzer, and the
// trace/observer panels so scope labels read identically everywhere.
// `boxed` matches Badge's box for when it sits beside one; scope names stay case-sensitive, so no uppercase.
export function ScopeTag({ children, className, boxed }: { children: ReactNode; className?: string; boxed?: boolean }) {
  const base = boxed
    ? `inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider ${VARIANT_CLASSES.group}`
    : "font-mono text-[11px] text-secondary tracking-wide bg-secondary/8 px-1.5 py-px rounded-sm";
  return (
    <span className={`${base}${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}
