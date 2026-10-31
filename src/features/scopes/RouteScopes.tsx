import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getNodeScopeBatch } from "../../api/client";
import { ScopeTag } from "../../components/ScopeTag";
import { scopeMapHref } from "./model";

export function RouteScopes({ids}:{ids:string[]}) {
  const {t}=useTranslation();
  const key=[...new Set(ids)].sort();
  const query=useQuery({queryKey:["route-node-scopes",key],queryFn:({signal})=>getNodeScopeBatch(key,signal),enabled:key.length>0,staleTime:60_000,retry:false});
  const names=[...new Set(Object.values(query.data??{}).flatMap(n=>n.scopes.map(s=>s.name)))].sort();
  return <div className="mt-2 space-y-2"><p className="text-[11px] text-text-muted">{t("scopeView.routeNodes")}</p><div className="flex flex-wrap gap-1">{names.map(name=><ScopeTag key={name} href={scopeMapHref(name,24,window.location.search)}>{name}</ScopeTag>)}</div>{query.isError&&<p className="text-xs text-warn">{t("scopeView.unavailable")}</p>}<p className="text-[10px] text-text-muted">{t("scopeView.routeHelp")}</p></div>;
}
