import type { ObserverSummary } from "./types";

// matches the server's read-time rule: last_status_at within 5 minutes = online (db/queries/queries.sql)
export const OBSERVER_ONLINE_WINDOW_MS = 5 * 60_000;

// The WS observerStatus event never reports offline, so the fetched status would stay green forever.
// Re-derive it from lastStatusAt recency at render time; rows without a timestamp keep the fetched value.
export function deriveObserverStatus(
  obs: Pick<ObserverSummary, "status" | "lastStatusAt">,
  now: number = Date.now(),
): ObserverSummary["status"] {
  if (obs.lastStatusAt == null) return obs.status;
  return now - obs.lastStatusAt < OBSERVER_ONLINE_WINDOW_MS ? "online" : "offline";
}
