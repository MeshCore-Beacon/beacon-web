import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getScopeActivity } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { Timestamp } from "../../components/Timestamp";
import { ScopeTag } from "../../components/ScopeTag";
import { ScopeWindow } from "./ScopeControls";
import { scopeMapHref } from "./model";
import { ScopeHistory } from "./ScopeHistory";
import type { ScopeHours } from "../nodes/scope-evidence";

function useActivity(hours:ScopeHours,global=false,enabled=true) {
  const {iatas,regionKey,isResolved}=useRegion();
  return useQuery({queryKey:["scope-activity",global?"all":regionKey,hours],queryFn:({signal})=>getScopeActivity(global?undefined:iatas,hours,signal),enabled:enabled&&(global||isResolved!==false),staleTime:30_000,refetchInterval:60_000,refetchIntervalInBackground:false,retry:false});
}

export function ObserverScopeActivity({observerId}:{observerId:string}) {
  const {t}=useTranslation();const [open,setOpen]=useState(false);const [hours,setHours]=useState<ScopeHours>(24);
  const query=useActivity(hours,true,open);const rows=query.data?.observers.filter(o=>o.observerId===observerId)??[];
  const total=rows.reduce((n,r)=>n+r.reports,0);
  return <details className="rounded-sm border border-border bg-bg-raised p-3" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary className="cursor-pointer text-xs font-semibold text-text-bright">{t("scopeView.title")}</summary>
    {open&&<div className="mt-3 space-y-2"><ScopeWindow value={hours} onChange={setHours}/>
      {query.isError?<p role="alert" className="text-xs text-warn">{t("scopeView.unavailable")}</p>:query.isPending?<p className="text-xs">{t("common.loading")}</p>:
        <div className="max-h-64 overflow-auto"><table className="w-full text-left font-mono text-[11px]" aria-label={t("scopeView.title")}><thead><tr><th>{t("scopeView.select")}</th><th>{t("scopeView.area")}</th><th>{t("scopeView.received")}</th><th>%</th></tr></thead><tbody>{rows.map(r=><tr key={`${r.iata}/${r.scope}`} className="border-t border-border-subtle"><td className="py-2"><ScopeTag href={scopeMapHref(r.scope,hours,window.location.search)}>{r.scope}</ScopeTag></td><td>{r.iata}</td><td>{r.reports.toLocaleString()}</td><td>{total?(100*r.reports/total).toFixed(1):"—"}</td></tr>)}</tbody></table>{!rows.length&&<p className="py-3 text-xs text-text-muted">{t("scopeView.unknown")}</p>}</div>}
      {query.data?.truncated&&<p className="text-xs text-warn">{t("scopeView.truncated")}</p>}
      <p className="text-[10px] text-text-muted">{t("scopeView.receiverNote")} {t("scopeView.partial")}</p>
    </div>}
  </details>;
}

export function ScopeActivityPanel() {
  const {t}=useTranslation();const [hours,setHours]=useState<ScopeHours>(24);const [search,setSearch]=useState("");const [limit,setLimit]=useState(200);
  const query=useActivity(hours);const data=query.data;
  const rows=useMemo(()=>data?.scopes.filter(s=>s.name.toLowerCase().includes(search.trim().toLowerCase()))??[],[data,search]);
  const total=(data?.scopes??[]).reduce((n,s)=>n+s.receiverReports,0);
  const history=rows.flatMap(s=>s.hourly.filter(h=>h.receiverReports>0).map(h=>({name:s.name,hour:h.hour,reports:h.receiverReports,uniqueSamples:h.uniqueSamples,firstSeen:h.hour,lastSeen:h.hour})));
  const countries=data?.countries.filter(s=>s.scope.toLowerCase().includes(search.trim().toLowerCase()))??[];
  return <section className="space-y-3 rounded-sm border border-border bg-bg-raised p-3" aria-label={t("scopeView.title")}>
    <div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto text-sm font-semibold text-text-bright">{t("scopeView.title")}</h2><input aria-label={t("scopeView.select")} type="search" placeholder="#ykf" className="min-h-8 w-32 rounded-sm border border-border bg-bg-surface px-2 text-xs" value={search} onChange={e=>{setSearch(e.target.value);setLimit(200);}}/><ScopeWindow value={hours} onChange={setHours}/></div>
    {query.isError?<p role="alert" className="text-xs text-warn">{t("scopeView.unavailable")}</p>:query.isPending?<p className="text-xs">{t("common.loading")}</p>:<>
      {data?.firstSeen&&<p className="text-[11px] text-text-muted">{t("scopeView.first")}: <Timestamp value={data.firstSeen}/> · {t("scopeView.latest")}: <Timestamp value={data.lastSeen!}/></p>}
      <div className="flex flex-wrap gap-4 text-xs text-text-normal">{["scoped","unscoped","unresolved"].map(kind=>{const count=(data?.scopes??[]).filter(s=>kind==="unscoped"?s.name==="*":kind==="unresolved"?s.name==="?":s.name!=="*"&&s.name!=="?").reduce((n,s)=>n+s.receiverReports,0);return <span key={kind}>{t(`scopeView.${kind}`)}: <b>{total?`${(100*count/total).toFixed(1)}%`:"—"}</b></span>;})}</div>
      <div className="max-h-80 overflow-auto"><table aria-label={t("scopeView.table")} className="w-full min-w-[690px] text-left font-mono text-[11px]"><thead className="text-text-muted"><tr><th>{t("scopeView.select")}</th><th>{t("scopeView.received")}</th><th>%</th><th title={t("scopeView.sampleHelp")}>{t("scopeView.samples")}</th><th>{t("scopeView.reports")}</th><th>{t("scopeView.repeaters")}</th><th>{t("scopeView.observers")}</th></tr></thead><tbody>{rows.slice(0,limit).map(s=><tr key={s.name} className="border-t border-border-subtle"><th className="py-2 font-normal"><ScopeTag href={scopeMapHref(s.name,hours,window.location.search)}>{s.name}</ScopeTag></th><td>{s.receiverReports?s.receiverReports.toLocaleString():"—"}</td><td>{total?(100*s.receiverReports/total).toFixed(1):"—"}</td><td>{s.receiverReports?s.uniqueSamples.toLocaleString():"—"}</td><td>{s.repeatReports.toLocaleString()}</td><td>{s.activeRepeaters.toLocaleString()}</td><td>{s.receivingObservers.toLocaleString()}</td></tr>)}</tbody></table></div>
      {data&&<ScopeHistory rows={history} hours={hours} until={data.until}/>}
      <p className="text-[11px] text-text-muted">{t("scopeView.ambiguous")}: {rows.reduce((n,s)=>n+s.ambiguousHops,0).toLocaleString()} · {t("scopeView.unresolvedHops")}: {rows.reduce((n,s)=>n+s.unresolvedHops,0).toLocaleString()}</p>
      <details><summary className="cursor-pointer text-xs text-text-normal">{t("scopeView.countries")}</summary><div className="mt-2 max-h-64 overflow-auto"><table aria-label={t("scopeView.countries")} className="w-full text-left font-mono text-[11px]"><thead><tr><th>{t("scopeView.country")}</th><th>{t("scopeView.select")}</th><th>{t("scopeView.received")}</th><th>{t("scopeView.samples")}</th><th>{t("scopeView.observers")}</th></tr></thead><tbody>{countries.slice(0,limit).map(c=><tr key={`${c.country}/${c.scope}`} className="border-t border-border-subtle"><td className="py-2">{c.country||"—"}</td><td><ScopeTag>{c.scope}</ScopeTag></td><td>{c.reports.toLocaleString()}</td><td>{c.uniqueSamples.toLocaleString()}</td><td>{c.observers.toLocaleString()}</td></tr>)}{["CA","US"].filter(c=>!countries.some(r=>r.country===c)).map(c=><tr key={c} className="border-t border-border-subtle text-text-muted"><td className="py-2">{c}</td><td colSpan={4}>{t("scopeView.unknown")}</td></tr>)}</tbody></table></div><p className="mt-2 text-[10px] text-text-muted">{t("scopeView.countryHelp")}</p></details>
      <details><summary className="cursor-pointer text-xs text-text-normal">{t("scopeView.observers")}</summary><div className="mt-2 max-h-64 overflow-auto"><table aria-label={t("scopeView.observers")} className="w-full text-left font-mono text-[11px]"><thead><tr><th>{t("scopeView.observer")}</th><th>{t("scopeView.area")}</th><th>{t("scopeView.select")}</th><th>{t("scopeView.received")}</th></tr></thead><tbody>{data?.observers.filter(o=>o.scope.toLowerCase().includes(search.trim().toLowerCase())).slice(0,limit).map(o=><tr key={`${o.observerId}/${o.iata}/${o.scope}`} className="border-t border-border-subtle"><td className="max-w-48 truncate py-2" title={o.name}>{o.name}</td><td>{o.iata}</td><td><ScopeTag href={scopeMapHref(o.scope,hours,window.location.search)}>{o.scope}</ScopeTag></td><td>{o.reports.toLocaleString()}</td></tr>)}</tbody></table></div></details>
    </>}
    {data&&Math.max(rows.length,countries.length,data.observers.length)>limit&&<button className="min-h-8 rounded-sm border border-border px-3 text-xs" onClick={()=>setLimit(n=>n+200)}>{t("scopeView.more",{count:limit})}</button>}
    {data?.truncated&&<p role="alert" className="text-xs text-warn">{t("scopeView.truncated")}</p>}
    <p className="text-[10px] text-text-muted">{t("scopeView.sampleHelp")} {t("scopeView.receiverNote")} {t("scopeView.unknownHelp")}</p>
  </section>;
}
