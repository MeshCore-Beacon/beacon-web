import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTick } from "../../hooks/useTick";
import { Section } from "../../components/DetailPanel";
import { Timestamp } from "../../components/Timestamp";
import type { Node, NodeSummary } from "./types";
import { nodeScopeStats, repeatCount, type ScopeHours } from "./scope-evidence";
import { scopeColor } from "../map/repeater-scopes";
import { ScopeWindow } from "../scopes/ScopeControls";
import { scopeMapHref } from "../scopes/model";
import { ScopeHistory } from "../scopes/ScopeHistory";

export function ScopeDistribution({ node, hours=24 }: { node: Pick<NodeSummary,"scopeEvidence"|"defaultScope">; hours?: ScopeHours }) {
  const {t}=useTranslation();const stats=nodeScopeStats(node,hours);
  const rows=stats.scopeNames.filter(n=>(stats.scopeRepeats[n]??0)>0).sort((a,b)=>stats.scopeRepeats[b]!-stats.scopeRepeats[a]!);
  if(!stats.totalRepeatObservations) return <p className="text-[11px] text-text-muted">{t("scopeView.noRecent")}</p>;
  return <div>
    <div role="img" aria-label={`${t("scopeView.distribution")}: ${rows.map(n=>`${n} ${(100*stats.scopeRepeats[n]!/stats.totalRepeatObservations).toFixed(1)}%`).join(", ")}`} className="flex h-2 overflow-hidden border border-border">
      {rows.map(n=><span key={n} title={`${n}: ${stats.scopeRepeats[n]!.toLocaleString()}`} style={{width:`${100*stats.scopeRepeats[n]!/stats.totalRepeatObservations}%`,backgroundColor:n==="?"?"#94a3b8":scopeColor(n,true)}}/>)}
    </div>
    <p className="mt-1 text-[10px] text-text-muted">{rows.slice(0,3).map(n=>`${n==="*"?t("scopeView.unscoped"):n==="?"?t("scopeView.unresolved"):n} ${(100*stats.scopeRepeats[n]!/stats.totalRepeatObservations).toFixed(1)}%`).join(" · ")} · {stats.totalRepeatObservations.toLocaleString()} {t("scopeView.reports")}</p>
  </div>;
}

export function AtlasScopes({node}:{node:Node}) {
  const {t}=useTranslation();const now=useTick(60_000);const storageKey=`beacon-atlas-scope-activity:${node.publicKey}`;
  const [shown,setShown]=useState(()=>{try{return localStorage.getItem(storageKey)==="on";}catch{return false;}});
  if(node.nodeType!==2) return null;
  return <div className="border-t border-border-subtle pt-2">
    <button type="button" className="text-[11px] text-text-muted hover:text-text-bright" aria-expanded={shown} onClick={()=>{setShown(!shown);try{localStorage.setItem(storageKey,shown?"off":"on");}catch{/* visit only */}}}>{shown?"▾":"▸"} {t(shown?"scopeView.hideAtlas":"scopeView.showAtlas")}</button>
    {shown&&<div className="mt-2"><ScopeDistribution node={node}/><details className="mt-2"><summary className="cursor-pointer text-[11px] text-text-muted">{t("scopeView.history")}</summary><ScopeHistory rows={node.scopeEvidence?.hourly??[]} until={node.scopeEvidence?.until??now}/></details></div>}
  </div>;
}

export function NodeScopes({ node }: { node: Node }) {
  const {t}=useTranslation();const now=useTick(60_000);const [hours,setHours]=useState<ScopeHours>(24);
  if(node.nodeType!==2)return null;
  const stats=nodeScopeStats(node,hours),evidence=new Map((node.scopeEvidence?.scopes??[]).map(s=>[s.name,s]));
  const repeated=node.scopeEvidence?.scopes.filter(s=>repeatCount(s,hours)>0)??[];
  const since=Math.ceil((node.scopeEvidence?.until??now)/3_600_000)*3_600_000-hours*3_600_000;
  const first=Math.min(...(node.scopeEvidence?.hourly?node.scopeEvidence.hourly.filter(h=>h.hour>=since).map(h=>h.firstSeen):repeated.flatMap(s=>s.firstRepeatedAt?[s.firstRepeatedAt]:[])));
  const last=Math.max(0,...repeated.map(s=>s.repeatedAt??0));
  return <Section title={t("map.scopeDetailsTitle")}>
    <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[11px] text-text-muted">{t("scopeView.reports")}</span><ScopeWindow value={hours} onChange={setHours}/></div>
    {!node.scopeEvidence&&<p className="mb-2 text-[11px] text-text-muted">{t("map.scopeEvidenceUnavailable")}</p>}
    <ScopeDistribution node={node} hours={hours}/>
    {last>0&&<p className="my-2 text-[10px] text-text-muted">{Number.isFinite(first)&&<>{t("scopeView.first")}: <Timestamp value={first}/> · </>}{t("scopeView.latest")}: <Timestamp value={last}/></p>}
    {stats.scopeNames.length?<ul className="mt-3 max-h-64 space-y-3 overflow-y-auto font-mono text-[11px]">
      {stats.scopeNames.sort((a,b)=>(stats.scopeRepeats[b]??0)-(stats.scopeRepeats[a]??0)||a.localeCompare(b)).map(name=>{
        const s=evidence.get(name),count=s?repeatCount(s,hours):0;
        return <li key={name}>
          <div className="flex items-center gap-2"><span aria-hidden className="h-2 w-2 shrink-0" style={{backgroundColor:name==="?"?"#94a3b8":scopeColor(name,true)}}/>
            <a className="min-w-0 flex-1 break-all text-text-normal hover:underline" href={scopeMapHref(name,hours,window.location.search)} title={t("scopeView.openMap")}>{name==="?"?t("scopeView.unresolved"):name==="*"?t(count>0?"scopeView.unscoped":s?.reported?"scopeView.wildcard":"map.scopeWildcard"):name}</a><span className="tabular-nums">{count?count.toLocaleString():"—"}</span></div>
          <div className="mt-1 space-y-0.5 pl-4 text-[10px] text-text-muted">
            {count>0&&<p>{t("map.scopeRepeated")}{s?.minHashBytes?` · ${t("map.scopeHashEvidence",{bytes:s.minHashBytes})}`:""}</p>}
            {s?.reported&&<p>{t(name==="*"?"scopeView.wildcard":"scopeView.reported")} · {s.reportedAt?<><Timestamp value={s.reportedAt}/>{now-s.reportedAt>86_400_000?` · ${t("scopeView.stale")}`:""}</>:t("scopeView.ageUnknown")}</p>}
            {s?.heardAt&&<p>{t("scopeView.heard")} · <Timestamp value={s.heardAt}/></p>}
            {node.defaultScope===name&&<p>{t("scopeView.default")}</p>}
            {s?.uniqueSince&&<p title={t("scopeView.sampleHelp")}>{t("scopeView.samples")}: {(s.uniqueSamples??0).toLocaleString()} · {t("scopeView.sampleSince")} <Timestamp value={s.uniqueSince}/><span> · 24h</span></p>}
          </div>
        </li>;
      })}
    </ul>:<p className="mt-2 text-[11px] text-text-muted">{t("scopeView.unknown")}</p>}
    {!stats.totalRepeatObservations&&stats.scopeNames.length>0&&<p className="mt-2 text-[10px] text-text-muted">{t("scopeView.configuredOnly")}</p>}
    {node.scopeEvidence?.reportedEmpty&&<p className="mt-2 text-[10px] text-text-muted">{t("map.scopeReportedEmpty")}</p>}
    {node.scopeEvidence?.conflictingReports&&<p className="mt-2 text-[10px] text-warn">{t("map.scopeReportConflict")}</p>}
    {node.scopeEvidence?.hourly&&<details className="mt-3"><summary className="cursor-pointer text-[11px] text-text-muted">{t("scopeView.history")}</summary><ScopeHistory rows={node.scopeEvidence.hourly} hours={hours} until={node.scopeEvidence.until}/></details>}
    <p className="mt-3 text-[10px] text-text-muted">{t("scopeView.partial")} {t("map.scopeReportMeaning")}</p>
  </Section>;
}
