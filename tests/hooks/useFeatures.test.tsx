import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useFeatures } from "../../src/hooks/useFeatures";

const OFF = { polling: false, accounts: "off", telemetryRequests: false, alerts: false };
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const stubInfo = (body: unknown, ok = true) =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status: ok ? 200 : 500, statusText: "x", headers: new Headers(), json: async () => body }) as Response));

beforeEach(() => { client = new QueryClient(); });
afterEach(() => { client.clear(); vi.unstubAllGlobals(); });

describe("useFeatures", () => {
  it("is all off until info loads", () => {
    stubInfo({ serverVersion: "2.3.0" });
    const { result } = renderHook(() => useFeatures(), { wrapper });
    expect(result.current).toEqual(OFF);
  });

  it("is all off when info has no features", async () => {
    stubInfo({ serverVersion: "2.2.0", minAppVersion: null, minWebVersion: null });
    const { result } = renderHook(() => useFeatures(), { wrapper });
    await waitFor(() => expect(client.getQueryState(["server-info"])?.status).toBe("success"));
    expect(result.current).toEqual(OFF);
  });

  it("is all off when the request fails", async () => {
    stubInfo({ error: { code: "boom", message: "boom" } }, false);
    const { result } = renderHook(() => useFeatures(), { wrapper });
    await waitFor(() => expect(client.getQueryState(["server-info"])?.status).toBe("error"));
    expect(result.current).toEqual(OFF);
  });

  it("returns the server's values when present", async () => {
    const features = { polling: true, accounts: "local", telemetryRequests: true, alerts: false };
    stubInfo({ serverVersion: "2.3.0", features });
    const { result } = renderHook(() => useFeatures(), { wrapper });
    await waitFor(() => expect(result.current.polling).toBe(true));
    expect(result.current).toEqual(features);
  });

  it("falls back to off for an accounts value it does not know", async () => {
    stubInfo({ serverVersion: "2.3.0", features: { polling: true, accounts: "oidc" } });
    const { result } = renderHook(() => useFeatures(), { wrapper });
    await waitFor(() => expect(result.current.polling).toBe(true));
    expect(result.current).toEqual({ ...OFF, polling: true });
  });
});
