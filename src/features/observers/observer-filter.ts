import { deriveObserverStatus } from "./observer-status";
import type { ObserverSummary } from "./types";

export interface ObserverFilters {
  search: string;
  status: string;
  type: string;
  scope: string;
}

export const observerName = (o: ObserverSummary) => o.displayName ?? o.id.slice(0, 8);

// Client-side over the loaded region list; broker isn't on the summary, so it stays a server filter.
export function filterObservers(list: ObserverSummary[], f: ObserverFilters, now: number): ObserverSummary[] {
  const q = f.search.trim().toLowerCase();
  return list.filter((o) =>
    (!q || observerName(o).toLowerCase().includes(q)) &&
    (!f.status || deriveObserverStatus(o, now) === f.status) &&
    (!f.type || o.observerType === f.type) &&
    (!f.scope || (o.scopes?.includes(f.scope) ?? false)),
  );
}
