import type { TFunction } from "i18next";

// The sentences beacon-server's polling package puts in statusReason, by the catalog key that carries each.
const REASONS: Record<string, string> = {
  "No observer can reach this repeater yet.": "noObserver",
  "Every observer that can reach this repeater is already polling its maximum.": "noSeat",
  "The repeater did not accept this guest password. Enter a new one.": "loginFailed",
  "The repeater did not accept a blank or hello login. Enter a guest password.": "blankFailed",
  "The repeater gave admin access to this password, so Beacon deleted it. Enter a guest password, never an admin one.": "adminStopped",
  "This repeater gives admin access to a blank login, so Beacon will not poll it without a guest password.": "blankBlocked",
};
const OFFLINE = /^Not heard by any observer for (\d+) days?\.$/;

// A server reason in the user's language; one this build does not know shows as the server sent it.
export function requestReasonText(t: TFunction, reason: string): string {
  const key = REASONS[reason];
  if (key) return t(`account.requests.reason.${key}`);
  const offline = OFFLINE.exec(reason);
  if (offline) return t("account.requests.reason.offline", { count: Number(offline[1]) });
  return reason;
}
