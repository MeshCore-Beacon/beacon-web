import { API_BASE } from "../lib/constants";
import { parseRetryAfter } from "./rate-limit";
import type {
  AlertRule, AlertRulePut, AlertsResponse, AppCodeRequest, AppCodeResponse, CheckEmailStatus, PasswordSetStatus, RegisterRequest, Session, TelemetryRequest, TelemetryRequestList, TelemetryRequestPatch, UserResponse, VerifyStatus,
} from "../features/account/types";
import type { PutAtlas, ServerAtlas } from "../features/atlas/atlasSync";

export class AuthError extends Error {
  status: number;
  code: string;
  retryAfterMs?: number;
  body?: unknown; // the parsed error body, for answers that carry data (the Atlas conflict)

  constructor(status: number, code: string, message: string, retryAfterMs?: number, body?: unknown) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.body = body;
  }
}

// The only fetch that sends the cookie and the forgery header; client.ts stays option-free for the scrape block.
export async function authRequest<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["X-Beacon-CSRF"] = "1";
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const init: RequestInit = { method, credentials: "include" };
  if (Object.keys(headers).length > 0) init.headers = headers;
  if (body !== undefined) init.body = JSON.stringify(body);
  if (signal) init.signal = signal;

  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const parsed = await res.json().catch(() => null);
    throw new AuthError(
      res.status,
      parsed?.error?.code ?? "unknown",
      parsed?.error?.message ?? res.statusText,
      parseRetryAfter(res.headers.get("Retry-After")),
      parsed,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const auth = {
  register: (req: RegisterRequest) => authRequest<CheckEmailStatus>("POST", "/auth/register", req),
  verify: (token: string) => authRequest<VerifyStatus>("POST", "/auth/verify", { token }),
  resendVerification: (email: string) => authRequest<CheckEmailStatus>("POST", "/auth/verify/resend", { email }),
  login: (login: string, password: string) => authRequest<UserResponse>("POST", "/auth/login", { login, password }),
  logout: () => authRequest<void>("POST", "/auth/logout"),
  requestReset: (email: string) => authRequest<CheckEmailStatus>("POST", "/auth/reset/request", { email }),
  confirmReset: (token: string, password: string) => authRequest<PasswordSetStatus>("POST", "/auth/reset/confirm", { token, password }),
  appCode: (req: AppCodeRequest) => authRequest<AppCodeResponse>("POST", "/auth/app/code", req),
};

export const me = {
  get: (signal?: AbortSignal) => authRequest<UserResponse>("GET", "/me", undefined, signal),
  setDisplayName: (displayName: string) => authRequest<UserResponse>("PATCH", "/me", { displayName }),
  changePassword: (currentPassword: string, newPassword: string) => authRequest<void>("POST", "/me/password", { currentPassword, newPassword }),
  changeEmail: (email: string, currentPassword: string) => authRequest<CheckEmailStatus>("POST", "/me/email", { email, currentPassword }),
  // A password in local mode; portal accounts have none and confirm with the typed username.
  deleteAccount: (proof: string | { confirmUsername: string }) =>
    authRequest<void>("DELETE", "/me", typeof proof === "string" ? { currentPassword: proof } : proof),
  sessions: () => authRequest<{ sessions: Session[] }>("GET", "/me/sessions"),
  endSession: (id: string) => authRequest<void>("DELETE", `/me/sessions/${encodeURIComponent(id)}`),
  endOtherSessions: () => authRequest<void>("DELETE", "/me/sessions"),
  atlas: (signal?: AbortSignal) => authRequest<ServerAtlas>("GET", "/me/atlas", undefined, signal),
  putAtlas: (body: PutAtlas) => authRequest<ServerAtlas>("PUT", "/me/atlas", body),
};

export const requests = {
  list: (signal?: AbortSignal) => authRequest<TelemetryRequestList>("GET", "/me/telemetry-requests", undefined, signal),
  create: (nodeId: string, password?: string) =>
    authRequest<TelemetryRequest>("POST", "/me/telemetry-requests", password ? { nodeId, password } : { nodeId }),
  update: (id: string, patch: TelemetryRequestPatch) =>
    authRequest<TelemetryRequest>("PATCH", `/me/telemetry-requests/${encodeURIComponent(id)}`, patch),
  remove: (id: string) => authRequest<void>("DELETE", `/me/telemetry-requests/${encodeURIComponent(id)}`),
};

export const alerts = {
  get: (signal?: AbortSignal) => authRequest<AlertsResponse>("GET", "/me/alerts", undefined, signal),
  putRule: (body: AlertRulePut) => authRequest<AlertRule>("PUT", "/me/alerts/rules", body),
  deleteRule: (id: string) => authRequest<void>("DELETE", `/me/alerts/rules/${encodeURIComponent(id)}`),
};
