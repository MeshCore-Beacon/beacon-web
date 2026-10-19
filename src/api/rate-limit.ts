import { RATE_LIMIT_DEFAULT_MS, RATE_LIMIT_MAX_MS, TRANSIENT_WAIT_MAX_MS } from "../lib/constants";

// Kept free of client.ts imports so tests that mock the client with partial factories stay valid.

// Retry-After as milliseconds. The server sends delta-seconds; the HTTP-date form is legal too.
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const value = header.trim();
  let ms: number;
  if (/^\d+$/.test(value)) {
    ms = Number(value) * 1000;
  } else {
    const at = Date.parse(value);
    if (Number.isNaN(at)) return undefined;
    ms = at - Date.now();
  }
  return Math.min(Math.max(ms, 0), RATE_LIMIT_MAX_MS);
}

// A 429, or a 503 with Retry-After, is a pause: retry the same request after the wait, at most three
// times. Other 4xx are final; anything else gets two quick retries.
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 429 || transientWaitMs(error) !== undefined) return failureCount < 3;
  if (failureCount >= 2) return false;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return true;
}

// Retry-After of a 503 (the server's busy or deadline guard), capped; undefined for anything else.
export function transientWaitMs(error: unknown): number | undefined {
  const e = error as { status?: unknown; retryAfterMs?: unknown } | null;
  return e?.status === 503 && typeof e.retryAfterMs === "number" ? Math.min(e.retryAfterMs, TRANSIENT_WAIT_MAX_MS) : undefined;
}

// TanStack Query retry delay: the server's wait when it gave one, else TanStack's own backoff.
export function queryRetryDelay(failureCount: number, error: unknown): number {
  return rateLimitWaitMs(error) ?? transientWaitMs(error) ?? Math.min(1000 * 2 ** failureCount, 30_000);
}

export const queryRetryDefaults = { retry: shouldRetryQuery, retryDelay: queryRetryDelay };

// How long to hold off before asking again for what a 429 refused; undefined for any other error.
export function rateLimitWaitMs(error: unknown): number | undefined {
  const e = error as { status?: unknown; retryAfterMs?: unknown } | null;
  if (e?.status !== 429) return undefined;
  return typeof e.retryAfterMs === "number" ? e.retryAfterMs : RATE_LIMIT_DEFAULT_MS;
}

// App-wide "the API is throttling us" flag: fed by the fetch wrapper, read by the header badge.

let limitedUntil: number | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function noteRateLimited(retryAfterMs: number = RATE_LIMIT_DEFAULT_MS): void {
  const until = Date.now() + retryAfterMs;
  if (limitedUntil !== null && until <= limitedUntil) return;
  limitedUntil = until;
  notify();
}

export function noteRequestOk(): void {
  if (limitedUntil === null) return;
  limitedUntil = null;
  notify();
}

export function getRateLimitedUntil(): number | null {
  return limitedUntil;
}

export function isRateLimited(): boolean {
  return limitedUntil !== null && Date.now() < limitedUntil;
}

export function subscribeRateLimit(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
