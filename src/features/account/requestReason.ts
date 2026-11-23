import type { TFunction } from "i18next";
import type { TelemetryRequest } from "./types";

// beacon-server's statusReasonCode, by the catalog key that carries each.
const KEYS: Record<string, string> = {
  no_observer: "noObserver",
  no_seat: "noSeat",
  login_failed: "loginFailed",
  blank_login_failed: "blankFailed",
  admin_stopped: "adminStopped",
  blank_blocked: "blankBlocked",
  observer: "observer",
};

// A request's reason in the user's language. No code (an older server) or one this build does not know shows statusReason as sent.
export function requestReasonText(t: TFunction, r: Pick<TelemetryRequest, "statusReason" | "statusReasonCode" | "statusReasonDays">): string {
  const code = r.statusReasonCode ?? "";
  if (KEYS[code]) return t(`account.requests.reason.${KEYS[code]}`);
  if (code === "offline" && Number.isInteger(r.statusReasonDays) && (r.statusReasonDays as number) >= 0) {
    return t("account.requests.reason.offline", { count: r.statusReasonDays });
  }
  return r.statusReason;
}
