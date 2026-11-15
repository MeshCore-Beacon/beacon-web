import { API_BASE } from "../lib/constants";
import { parseRetryAfter } from "./rate-limit";
import type {
  AppCodeRequest, AppCodeResponse, CheckEmailStatus, PasswordSetStatus, RegisterRequest, Session, UserResponse, VerifyStatus,
} from "../features/account/types";

export class AuthError extends Error {
  status: number;
  code: string;
  retryAfterMs?: number;

  constructor(status: number, code: string, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
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
  deleteAccount: (currentPassword: string) => authRequest<void>("DELETE", "/me", { currentPassword }),
  sessions: () => authRequest<{ sessions: Session[] }>("GET", "/me/sessions"),
  endSession: (id: string) => authRequest<void>("DELETE", `/me/sessions/${encodeURIComponent(id)}`),
  endOtherSessions: () => authRequest<void>("DELETE", "/me/sessions"),
};
