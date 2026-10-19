import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseRetryAfter,
  shouldRetryQuery,
  transientWaitMs,
  queryRetryDelay,
  noteRateLimited,
  noteRequestOk,
  getRateLimitedUntil,
  isRateLimited,
  subscribeRateLimit,
} from "../../src/api/rate-limit";
import { RATE_LIMIT_DEFAULT_MS, RATE_LIMIT_MAX_MS } from "../../src/lib/constants";

afterEach(() => {
  noteRequestOk();
  vi.useRealTimers();
});

describe("parseRetryAfter", () => {
  it("reads delta-seconds as milliseconds", () => {
    expect(parseRetryAfter("7")).toBe(7_000);
  });

  it("reads an HTTP-date relative to now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
    expect(parseRetryAfter("Wed, 02 Sep 2026 12:00:30 GMT")).toBe(30_000);
  });

  it("returns undefined for a missing or junk header", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });

  it("clamps absurd values to the ceiling", () => {
    expect(parseRetryAfter("9999")).toBe(RATE_LIMIT_MAX_MS);
  });
});

describe("shouldRetryQuery", () => {
  it("retries a 429 three times", () => {
    expect([0, 1, 2, 3].map((n) => shouldRetryQuery(n, { status: 429, retryAfterMs: 1_000 }))).toEqual([true, true, true, false]);
  });

  it("retries a 503 with Retry-After three times", () => {
    expect([0, 1, 2, 3].map((n) => shouldRetryQuery(n, { status: 503, retryAfterMs: 5_000 }))).toEqual([true, true, true, false]);
  });

  it("keeps two retries for a 503 without Retry-After", () => {
    expect([0, 1, 2].map((n) => shouldRetryQuery(n, { status: 503 }))).toEqual([true, true, false]);
  });

  it("never retries a 404", () => {
    expect(shouldRetryQuery(0, { status: 404 })).toBe(false);
  });

  it("retries a 5xx twice then stops", () => {
    expect(shouldRetryQuery(0, { status: 500 })).toBe(true);
    expect(shouldRetryQuery(1, { status: 500 })).toBe(true);
    expect(shouldRetryQuery(2, { status: 500 })).toBe(false);
  });

  it("retries a network error", () => {
    expect(shouldRetryQuery(0, new TypeError("Failed to fetch"))).toBe(true);
  });
});

describe("transientWaitMs / queryRetryDelay", () => {
  it("waits Retry-After for a 503 that sent it", () => {
    expect(transientWaitMs({ status: 503, retryAfterMs: 5_000 })).toBe(5_000);
    expect(queryRetryDelay(0, { status: 503, code: "deadline_exceeded", retryAfterMs: 5_000 })).toBe(5_000);
    expect(queryRetryDelay(0, { status: 503, code: "service_unavailable", retryAfterMs: 2_000 })).toBe(2_000);
  });

  it("waits Retry-After for a 429, or the default window without it", () => {
    expect(queryRetryDelay(0, { status: 429, retryAfterMs: 1_000 })).toBe(1_000);
    expect(queryRetryDelay(0, { status: 429 })).toBe(RATE_LIMIT_DEFAULT_MS);
  });

  it("caps a 503's wait at 30 s but leaves a 429's wait to the 5 min ceiling", () => {
    expect(transientWaitMs({ status: 503, retryAfterMs: 120_000 })).toBe(30_000);
    expect(queryRetryDelay(0, { status: 503, retryAfterMs: 120_000 })).toBe(30_000);
    expect(queryRetryDelay(0, { status: 429, retryAfterMs: 120_000 })).toBe(120_000);
  });

  it("falls back to exponential backoff otherwise", () => {
    expect(transientWaitMs({ status: 503 })).toBeUndefined();
    expect(transientWaitMs({ status: 500, retryAfterMs: 5_000 })).toBeUndefined();
    expect([0, 1, 5].map((n) => queryRetryDelay(n, { status: 500 }))).toEqual([1_000, 2_000, 30_000]);
  });
});

describe("rate-limit store", () => {
  it("starts un-limited", () => {
    expect(getRateLimitedUntil()).toBeNull();
    expect(isRateLimited()).toBe(false);
  });

  it("noteRateLimited opens the window and notifies subscribers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const cb = vi.fn();
    const unsub = subscribeRateLimit(cb);

    noteRateLimited(5_000);

    expect(getRateLimitedUntil()).toBe(1_005_000);
    expect(isRateLimited()).toBe(true);
    expect(cb).toHaveBeenCalledOnce();
    unsub();
  });

  it("uses the default window when no Retry-After was given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    noteRateLimited();
    expect(getRateLimitedUntil()).toBe(1_000_000 + RATE_LIMIT_DEFAULT_MS);
  });

  it("is no longer limited once the window elapses", () => {
    vi.useFakeTimers();
    noteRateLimited(5_000);
    vi.advanceTimersByTime(5_000);
    expect(isRateLimited()).toBe(false);
  });

  it("a longer window extends, a shorter one does not shrink", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    noteRateLimited(5_000);
    noteRateLimited(10_000);
    expect(getRateLimitedUntil()).toBe(10_000);
    noteRateLimited(2_000);
    expect(getRateLimitedUntil()).toBe(10_000);
  });

  it("noteRequestOk clears and notifies, and stays quiet when nothing was set", () => {
    const cb = vi.fn();
    const unsub = subscribeRateLimit(cb);

    noteRequestOk();
    expect(cb).not.toHaveBeenCalled();

    noteRateLimited(5_000);
    noteRequestOk();
    expect(getRateLimitedUntil()).toBeNull();
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
  });
});
