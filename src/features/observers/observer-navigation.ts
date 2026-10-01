import type { StatsRange } from "../stats/types";

export const observerRange = (value: string | null): StatsRange => value === "24h" || value === "30d" ? value : "7d";

export function observerDestination(params: URLSearchParams, id: string | null, range = observerRange(params.get("range"))) {
  const next = new URLSearchParams(params);
  next.set("tab", "Observers");
  for (const key of ["statsTab", "observerId", "node", "route", "routeIata", "routeRange", "routeSince", "routeUntil", "compareA", "compareB", "compareSince"]) next.delete(key);
  if (id) { next.set("observer", id); next.set("range", range); }
  else { next.delete("observer"); next.delete("range"); next.delete("compareWith"); next.delete("compareUntil"); }
  return next;
}
