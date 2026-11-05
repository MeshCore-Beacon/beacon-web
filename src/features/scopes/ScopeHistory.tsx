import { scopeHistoryBuckets } from "./model";
import { useTranslation } from "react-i18next";
import type { NodeScopeHour } from "../nodes/types";
import type { ScopeHours } from "../nodes/scope-evidence";
import { scopeColor } from "../map/repeater-scopes";

export function ScopeHistory({ rows, hours = 24, until }: { rows: NodeScopeHour[]; hours?: ScopeHours; until: number }) {
  const { t }=useTranslation();
  const end=Math.ceil(until/3_600_000)*3_600_000;
  const buckets=scopeHistoryBuckets(rows,end-hours*3_600_000,hours);
  const max=Math.max(1,...buckets.map(b=>b.rows.reduce((n,r)=>n+r.reports,0)));
  return <div>
    <svg role="img" aria-label={t("scopeView.history")} viewBox={`0 0 ${hours*12} 48`} className="mt-2 h-14 w-full" preserveAspectRatio="none">
      <title>{t("scopeView.historyHelp")}</title>
      {buckets.map((b,i)=>{
        let y=46;
        return <g key={b.hour}><title>{new Date(b.hour).toLocaleString()} · {b.rows.length?b.rows.map(r=>`${r.name}: ${r.reports}`).join(", "):t("scopeView.unknown")}</title>
          {!b.rows.length && <rect x={i*12+1} y={7} width={9} height={39} fill="none" stroke="var(--color-text-muted,#64748b)" strokeDasharray="2 3" opacity={0.5}/>}
          {b.rows.map(r=>{const height=44*r.reports/max;y-=height;return <rect key={r.name} x={i*12+1} y={y} width={9} height={height} fill={r.name==="?"?"#94a3b8":scopeColor(r.name,true)}/>;})}
        </g>;
      })}
    </svg>
    <p className="mt-1 text-[10px] text-text-muted">{t("scopeView.historyHelp")}</p>
  </div>;
}
