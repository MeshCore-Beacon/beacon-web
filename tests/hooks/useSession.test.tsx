import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { clearSession, setSessionUser, useSession } from "../../src/hooks/useSession";
import type { User } from "../../src/features/account/types";

const user: User = { id: "1", username: "ridge", displayName: "Ridge", email: "a@example.org", emailVerified: true, pendingEmail: null, provider: "local", createdAt: 1 };
let client: QueryClient;
let calls: string[];
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

function res(status: number, body?: unknown) {
  return { ok: status < 300, status, statusText: "x", headers: new Headers(), json: async () => body } as Response;
}
function stub(accounts: string, meStatus: number, meBody?: unknown) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    if (url.endsWith("/info")) return res(200, { serverVersion: "2.3.0", features: { accounts } });
    return res(meStatus, meBody);
  }));
}
const meCalls = () => calls.filter((u) => u.endsWith("/me"));

beforeEach(() => { client = new QueryClient(); });
afterEach(() => { client.clear(); vi.unstubAllGlobals(); });

describe("useSession", () => {
  it("returns the user when signed in", async () => {
    stub("local", 200, { user });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(user));
    expect(result.current.enabled).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("treats a 401 as signed out, not an error, and does not retry", async () => {
    stub("local", 401, { error: { code: "not_signed_in", message: "no" } });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(client.getQueryState(["me"])?.status).toBe("success"));
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(meCalls()).toHaveLength(1);
  });

  it("treats a 404 accounts_disabled as signed out", async () => {
    stub("local", 404, { error: { code: "accounts_disabled", message: "off" } });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(client.getQueryState(["me"])?.status).toBe("success"));
    expect(result.current.user).toBeNull();
    expect(meCalls()).toHaveLength(1);
  });

  it("makes no /me request when accounts are off", async () => {
    stub("off", 200, { user });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(client.getQueryState(["server-info"])?.status).toBe("success"));
    expect(result.current).toMatchObject({ user: null, enabled: false, loading: false });
    expect(meCalls()).toHaveLength(0);
  });

  it("is signed out after clearSession and signed in after setSessionUser", async () => {
    stub("local", 200, { user });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(user));
    act(() => clearSession(client));
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(result.current.loading).toBe(false);
    act(() => setSessionUser(client, { ...user, displayName: "New" }));
    await waitFor(() => expect(result.current.user?.displayName).toBe("New"));
  });

  it("refresh refetches /me", async () => {
    stub("local", 200, { user });
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual(user));
    act(() => result.current.refresh());
    await waitFor(() => expect(meCalls()).toHaveLength(2));
  });

  it("keeps a logout when an older /me answers afterwards", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/info")) return res(200, { serverVersion: "2.3.0", features: { accounts: "local" } });
      await gate;
      return res(200, { user });
    }));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(client.getQueryState(["me"])?.fetchStatus).toBe("fetching"));
    act(() => clearSession(client));
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(client.getQueryData(["me"])).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it("keeps a login when an older signed-out /me answers afterwards", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/info")) return res(200, { serverVersion: "2.3.0", features: { accounts: "local" } });
      await gate;
      return res(401, { error: { code: "not_signed_in", message: "no" } });
    }));
    renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(client.getQueryState(["me"])?.fetchStatus).toBe("fetching"));
    act(() => setSessionUser(client, user));
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(client.getQueryData(["me"])).toEqual(user);
  });

  it("drops every private query when the session changes, but not public ones", async () => {
    stub("local", 200, { user });
    client.setQueryData(["me", "sessions"], { sessions: [{ id: "a" }] });
    client.setQueryData(["me", "alerts"], []);
    client.setQueryData(["me", "telemetry-requests"], []);
    client.setQueryData(["nodes"], [1]);
    act(() => setSessionUser(client, { ...user, id: "2" }));
    expect(client.getQueryData(["me", "sessions"])).toBeUndefined();
    expect(client.getQueryData(["me", "alerts"])).toBeUndefined();
    expect(client.getQueryData(["me", "telemetry-requests"])).toBeUndefined();
    expect(client.getQueryData(["nodes"])).toEqual([1]);
    expect(client.getQueryData(["me"])).toEqual({ ...user, id: "2" });
    client.setQueryData(["me", "sessions"], { sessions: [] });
    act(() => clearSession(client));
    expect(client.getQueryData(["me", "sessions"])).toBeUndefined();
    expect(client.getQueryData(["me"])).toBeNull();
  });
});
