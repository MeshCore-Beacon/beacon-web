import type { ScopeHours } from "../nodes/scope-evidence";
import type { NodeScopeHour } from "../nodes/types";

export function scopeMapHref(name: string, hours: ScopeHours = 24, search = "") {
  const old = new URLSearchParams(search), params = new URLSearchParams({ tab: "Map", repeater_scopes: "on", scope_focus: name, scope_hours: String(hours), scope_mode: "isolate" });
  for (const key of ["iata", "region", "regionId"]) { const value = old.get(key); if(value) params.set(key,value); }
  return `?${params}`;
}

export function scopeHistoryBuckets(rows: NodeScopeHour[], since: number, hours: ScopeHours) {
  return Array.from({length:hours},(_,i) => ({hour:since+i*3_600_000, rows:rows.filter(r => r.hour===since+i*3_600_000)}));
}
