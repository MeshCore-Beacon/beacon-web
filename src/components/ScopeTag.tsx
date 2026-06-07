import type { ReactNode } from "react";

// Small secondary chip marking a transport scope, shared across packet rows, the analyzer, and the
// trace/observer panels so scope labels read identically everywhere.
export function ScopeTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-[11px] text-secondary tracking-wide bg-secondary/8 px-1.5 py-px rounded-sm${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}
