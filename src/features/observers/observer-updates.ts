import type { ObserverSummary } from "./types";
import type { WsObserverStatus } from "../../types/ws";

// Patch an observer's status/displayName in a cached list (immutably). Mirrors patchNodeSummary:
// an observer not already in the list is left as-is (a new one surfaces on the next reload), and a
// miss returns the SAME list reference so patchInfinitePages can skip the update.
export function patchObserverSummary(
  list: ObserverSummary[] | undefined,
  data: WsObserverStatus["data"],
): ObserverSummary[] | undefined {
  if (!list) return list;
  const idx = list.findIndex((o) => o.id === data.observerId);
  if (idx === -1) return list;
  const prev = list[idx]!;
  const status = data.online ? "online" : "offline";
  const displayName = data.displayName || prev.displayName;
  // an unchanged status event must keep the SAME ref so patchInfinitePages no-ops (no row re-render)
  if (status === prev.status && displayName === prev.displayName) return list;
  const updated = [...list];
  updated[idx] = { ...prev, status, displayName };
  return updated;
}
