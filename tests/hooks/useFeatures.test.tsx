import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDisplayUnits, useFeatures, useFeaturesLoading } from "../../src/hooks/useFeatures";

const OFF = { polling: false, accounts: "off", registration: false, telemetryRequests: false, alerts: false, atlasTelemetry: false, mapTelemetry: false };
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
    const features = { polling: true, accounts: "local", registration: true, telemetryRequests: true, alerts: false, atlasTelemetry: true, mapTelemetry: true };
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

describe("useFeaturesLoading", () => {
  it("is true until info settles, then false, also on failure", async () => {
    stubInfo({ error: { code: "boom", message: "boom" } }, false);
    const { result } = renderHook(() => useFeaturesLoading(), { wrapper });
    expect(result.current).toBe(true);
    await waitFor(() => expect(result.current).toBe(false));
  });
});

describe("useDisplayUnits", () => {
  it("is Celsius and metric without a display block", async () => {
    stubInfo({ serverVersion: "2.3.0" });
    const { result } = renderHook(() => useDisplayUnits(), { wrapper });
    await waitFor(() => expect(client.getQueryState(["server-info"])?.status).toBe("success"));
    expect(result.current).toEqual({ temperature: "c", distance: "metric" });
  });

  it("returns the instance units", async () => {
    stubInfo({ serverVersion: "2.3.0", display: { temperatureUnit: "f", distanceUnit: "imperial" } });
    const { result } = renderHook(() => useDisplayUnits(), { wrapper });
    await waitFor(() => expect(result.current.temperature).toBe("f"));
    expect(result.current).toEqual({ temperature: "f", distance: "imperial" });
  });

  it("reads an unknown unit as the default", async () => {
    stubInfo({ serverVersion: "2.3.0", display: { temperatureUnit: "k", distanceUnit: "nautical" } });
    const { result } = renderHook(() => useDisplayUnits(), { wrapper });
    await waitFor(() => expect(client.getQueryState(["server-info"])?.status).toBe("success"));
    expect(result.current).toEqual({ temperature: "c", distance: "metric" });
  });
});
