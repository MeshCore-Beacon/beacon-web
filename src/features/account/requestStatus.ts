import type { TFunction } from "i18next";
import type { TelemetryRequest } from "./types";

export type Tone = "ok" | "wait" | "bad" | "idle";

const WAITING = new Set(["pending", "not_direct", "no_reply", "not_claimed"]);
const PASSWORD = new Set(["login_failed", "admin_stop"]);
const KNOWN = new Set(["ok", ...WAITING, ...PASSWORD]);

// What a request reads as at a glance. An active request with a poller state from the server says what
// the observer is really doing; a missing or unknown state (older server) keeps the plain status.
export function requestLine(t: TFunction, r: Pick<TelemetryRequest, "status" | "poller">): { text: string; tone: Tone; names: boolean } {
  if (r.status === "active") {
    const state = r.poller?.state;
    if (r.poller && state && KNOWN.has(state)) {
      const key = PASSWORD.has(state) ? "password" : state;
      return { text: t(`account.requests.poll.${key}`, { name: r.poller.name }), tone: state === "ok" ? "ok" : "wait", names: true };
    }
    return { text: t("account.requests.status.active"), tone: "idle", names: false };
  }
  const tone: Tone = r.status === "waiting" ? "wait" : r.status === "disabled" ? "idle" : "bad";
  return { text: t(`account.requests.status.${r.status}`), tone, names: false };
}
