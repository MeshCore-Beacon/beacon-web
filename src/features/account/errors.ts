import type { TFunction } from "i18next";

const KNOWN = new Set([
  "invalid_credentials", "email_unverified", "token_invalid", "username_taken", "weak_password",
  "invalid_input", "registration_closed", "not_signed_in", "csrf_rejected", "accounts_disabled",
  "service_unavailable", "read_only",
]);

function when(t: TFunction, ms?: number): string {
  if (!ms || ms <= 0) return t("account.errors.whenLater");
  const seconds = Math.ceil(ms / 1000);
  return seconds < 60
    ? t("account.errors.whenSeconds", { count: seconds })
    : t("account.errors.whenMinutes", { count: Math.ceil(seconds / 60) });
}

// Maps a server error code to a string; never echoes the request, so no secret can ride along.
export function authErrorText(t: TFunction, err: unknown): string {
  const { code, message, retryAfterMs } = (err ?? {}) as { code?: unknown; message?: unknown; retryAfterMs?: number };
  if (code === "too_many_attempts" || code === "rate_limited") {
    return t("account.errors.tooMany", { when: when(t, retryAfterMs) });
  }
  if (code === "weak_password") {
    return t("account.errors.weak_password", { reason: typeof message === "string" ? message : "" });
  }
  if (typeof code === "string" && KNOWN.has(code)) return t(`account.errors.${code}`);
  return t("account.errors.generic");
}

export const errorCode = (err: unknown): string | undefined => (err as { code?: string } | null)?.code;

const REQUEST_CODES = new Set([
  "request_limit", "already_requested", "not_a_repeater", "password_invalid", "no_password_blocked", "requests_disabled", "not_found",
]);

// Telemetry request errors; any other code falls back to the shared mapping. Never echoes the request.
export function requestErrorText(t: TFunction, err: unknown): string {
  const code = errorCode(err);
  return code && REQUEST_CODES.has(code) ? t(`account.requests.errors.${code}`) : authErrorText(t, err);
}
