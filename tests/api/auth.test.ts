import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../../src/lib/constants";
import { AuthError, auth, authRequest, me, requests } from "../../src/api/auth";

function stub(status: number, body?: unknown, headers: Record<string, string> = {}) {
  const fn = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "x",
    headers: new Headers(headers),
    json: async () => { if (body === undefined) throw new Error("no body"); return body; },
  }) as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("authRequest", () => {
  it("sends method, credentials, CSRF header and JSON body, and nothing else", async () => {
    const fn = stub(200, { status: "verified" });
    const out = await authRequest("POST", "/auth/verify", { token: "t" });
    expect(out).toEqual({ status: "verified" });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/auth/verify`);
    expect(init).toEqual({
      method: "POST",
      credentials: "include",
      headers: { "X-Beacon-CSRF": "1", "Content-Type": "application/json" },
      body: JSON.stringify({ token: "t" }),
    });
  });

  it("sends no CSRF header and no body on a GET", async () => {
    const fn = stub(200, { user: {} });
    await authRequest("GET", "/me");
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init).toEqual({ method: "GET", credentials: "include" });
  });

  it("sends the CSRF header without a body on a bodyless non-GET", async () => {
    const fn = stub(204);
    await authRequest("POST", "/auth/logout");
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init).toEqual({ method: "POST", credentials: "include", headers: { "X-Beacon-CSRF": "1" } });
  });

  it("passes the abort signal", async () => {
    const fn = stub(200, {});
    const ac = new AbortController();
    await authRequest("GET", "/me", undefined, ac.signal);
    expect((fn.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(ac.signal);
  });

  it("resolves undefined for a 204", async () => {
    stub(204);
    await expect(authRequest("POST", "/auth/logout")).resolves.toBeUndefined();
  });

  it("parses the error body and Retry-After into an AuthError", async () => {
    stub(429, { error: { code: "rate_limited", message: "slow down" } }, { "Retry-After": "7" });
    const err = await authRequest("POST", "/auth/login", {}).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err).toMatchObject({ status: 429, code: "rate_limited", message: "slow down", retryAfterMs: 7000 });
  });

  it("falls back to unknown when the error body is not JSON", async () => {
    stub(502);
    const err = await authRequest("GET", "/me").catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: "unknown", message: "x" });
    expect(err.retryAfterMs).toBeUndefined();
  });
});

describe("route functions", () => {
  const cases: [string, () => Promise<unknown>, string, string, unknown?][] = [
    ["register", () => auth.register({ username: "u", email: "e", password: "p" }), "POST", "/auth/register", { username: "u", email: "e", password: "p" }],
    ["verify", () => auth.verify("tok"), "POST", "/auth/verify", { token: "tok" }],
    ["resendVerification", () => auth.resendVerification("e"), "POST", "/auth/verify/resend", { email: "e" }],
    ["login", () => auth.login("u", "p"), "POST", "/auth/login", { login: "u", password: "p" }],
    ["logout", () => auth.logout(), "POST", "/auth/logout"],
    ["requestReset", () => auth.requestReset("e"), "POST", "/auth/reset/request", { email: "e" }],
    ["confirmReset", () => auth.confirmReset("t", "p"), "POST", "/auth/reset/confirm", { token: "t", password: "p" }],
    ["appCode", () => auth.appCode({ codeChallenge: "c", state: "s", deviceLabel: "d" }), "POST", "/auth/app/code", { codeChallenge: "c", state: "s", deviceLabel: "d" }],
    ["me.get", () => me.get(), "GET", "/me"],
    ["setDisplayName", () => me.setDisplayName("N"), "PATCH", "/me", { displayName: "N" }],
    ["changePassword", () => me.changePassword("a", "b"), "POST", "/me/password", { currentPassword: "a", newPassword: "b" }],
    ["changeEmail", () => me.changeEmail("e", "p"), "POST", "/me/email", { email: "e", currentPassword: "p" }],
    ["deleteAccount", () => me.deleteAccount("p"), "DELETE", "/me", { currentPassword: "p" }],
    ["sessions", () => me.sessions(), "GET", "/me/sessions"],
    ["endSession", () => me.endSession("a/b"), "DELETE", "/me/sessions/a%2Fb"],
    ["endOtherSessions", () => me.endOtherSessions(), "DELETE", "/me/sessions"],
  ];
  it.each(cases)("%s", async (_n, call, method, path, body) => {
    const fn = stub(200, {});
    await call();
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE}${path}`);
    expect(init.method).toBe(method);
    expect(init.body).toBe(body === undefined ? undefined : JSON.stringify(body));
  });
});

describe("requests", () => {
  const cases: [string, () => Promise<unknown>, string, string, unknown?][] = [
    ["list", () => requests.list(), "GET", "/me/telemetry-requests"],
    ["create with a password", () => requests.create("n1", "guest"), "POST", "/me/telemetry-requests", { nodeId: "n1", password: "guest" }],
    ["create without one", () => requests.create("n1", ""), "POST", "/me/telemetry-requests", { nodeId: "n1" }],
    ["clear the password", () => requests.update("r/1", { password: null }), "PATCH", "/me/telemetry-requests/r%2F1", { password: null }],
    ["re-enable", () => requests.update("r1", { enabled: true }), "PATCH", "/me/telemetry-requests/r1", { enabled: true }],
    ["remove", () => requests.remove("r1"), "DELETE", "/me/telemetry-requests/r1"],
  ];
  it.each(cases)("%s", async (_n, call, method, path, body) => {
    const fn = stub(200, {});
    await call();
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE}${path}`);
    expect(init.method).toBe(method);
    expect(init.body).toBe(body === undefined ? undefined : JSON.stringify(body));
  });
});
