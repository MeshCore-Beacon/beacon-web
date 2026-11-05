import { queryOptions } from "@tanstack/react-query";
import { getScopeActivity, type StatsRegion } from "../../api/client";
import type { ScopeHours } from "../nodes/scope-evidence";

export function scopeActivityQuery(where:StatsRegion,regionKey:string,hours:ScopeHours=24) {
  // An explicitly empty named region must never turn into an all-region request.
  const iatas=where===undefined||Array.isArray(where)?where:[];
  return queryOptions({queryKey:["scope-activity",regionKey,hours],queryFn:({signal})=>getScopeActivity(iatas,hours,signal),staleTime:30_000,refetchOnWindowFocus:false,retry:false});
}
