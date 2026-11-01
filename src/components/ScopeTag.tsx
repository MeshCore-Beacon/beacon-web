import type { ReactNode } from "react";
import { scopeColor } from "../features/map/repeater-scopes";
import { VARIANT_CLASSES } from "./badge-utils";

// Small secondary chip marking a transport scope, shared across packet rows, the analyzer, and the
// trace/observer panels so scope labels read identically everywhere.
// `boxed` matches Badge's box for when it sits beside one; scope names stay case-sensitive, so no uppercase.
export function ScopeTag({ children, className, boxed, href, scopeName }: { children: ReactNode; className?: string; boxed?: boolean; href?:string; scopeName?:string }) {
  const base = boxed
    ? `inline-flex items-center font-mono text-[11px] font-semibold px-2 py-0.5 rounded-sm border tracking-wider ${VARIANT_CLASSES.group}`
    : "font-mono text-[11px] text-secondary tracking-wide bg-secondary/8 px-1.5 py-px rounded-sm";
  const name=scopeName??(typeof children==="string"?children:undefined);
  const style=name?{color:name==="?"?"#94a3b8":scopeColor(name,true)}:undefined;
  return href?<a href={href} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} style={style} className={`${base} hover:underline${className?` ${className}`:""}`}>{children}</a>:(
    <span style={style} className={`${base}${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}
