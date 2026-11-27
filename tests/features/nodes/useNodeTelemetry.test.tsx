import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { shouldRetryQuery } from "../../../src/api/rate-limit";
import { useNodePoller, useNodePolling, useNodeTelemetry } from "../../../src/features/nodes/useNodeTelemetry";

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const telemetry = { range: "24h", interval: "1h", polled: true, untrustedReadings: 0, points: [{ t: 1, readings: 2 }] };
const polling = { polled: true, latestReadingAt: 5, poller: null, standbys: [] };
const poller = { claim: null, readings24h: 0, targets: [] };
const respond = (status: number, body: unknown) =>
  vi.fn(async () => ({ ok: status < 400, status, statusText: "x", headers: new Headers(), json: async () => body }) as Response);

beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 1 } } }); });
afterEach(() => { client.clear(); vi.unstubAllGlobals(); });

describe("useNodeTelemetry", () => {
  it("fetches the range and keys the query by node and range", async () => {
    const fetchSpy = respond(200, telemetry);
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useNodeTelemetry("n1", "24h", true), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(telemetry));
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/nodes/n1/telemetry?range=24h&interval=1h");
    expect(result.current.unsupported).toBe(false);
    expect(client.getQueryData(["node-telemetry", "n1", "24h"])).toEqual({ unsupported: false, telemetry });
  });

  it("asks for an explicit interval under its own cache entry", async () => {
    const fetchSpy = respond(200, telemetry);
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useNodeTelemetry("n1", "168h", true, undefined, "1h"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(telemetry));
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/nodes/n1/telemetry?range=168h&interval=1h");
    expect(client.getQueryData(["node-telemetry", "n1", "168h", "1h"])).toBeDefined();
    expect(client.getQueryData(["node-telemetry", "n1", "168h"])).toBeUndefined();
  });

  it("does not fetch when disabled or without an id", async () => {
    const fetchSpy = respond(200, telemetry);
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useNodeTelemetry("n1", "24h", false), { wrapper });
    renderHook(() => useNodeTelemetry(undefined, "24h", true), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a 404 as unsupported without retrying", async () => {
    const fetchSpy = respond(404, { error: { code: "not_found", message: "no" } });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useNodeTelemetry("n1", "168h", true), { wrapper });
    await waitFor(() => expect(result.current.unsupported).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("makes no second request after a 404 even with a refetch interval", async () => {
    const fetchSpy = respond(404, { error: { code: "not_found", message: "no" } });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useNodeTelemetry("n1", "24h", true, 10), { wrapper });
    await waitFor(() => expect(result.current.unsupported).toBe(true));
    await new Promise((r) => setTimeout(r, 80));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps refetching on the interval while supported", async () => {
    const fetchSpy = respond(200, telemetry);
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useNodeTelemetry("n1", "24h", true, 10), { wrapper });
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(1));
  });

  it("still surfaces other errors", async () => {
    vi.stubGlobal("fetch", respond(400, { error: { code: "bad", message: "no" } }));
    const { result } = renderHook(() => useNodeTelemetry("n1", "168h", true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useNodePolling", () => {
  it("fetches the polling answer", async () => {
    const fetchSpy = respond(200, polling);
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useNodePolling("n1", true), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(polling));
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/nodes/n1/polling");
    expect(client.getQueryData(["node-polling", "n1"])).toEqual(polling);
  });

  it("does not fetch when disabled", async () => {
    const fetchSpy = respond(200, polling);
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useNodePolling("n1", false), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves a 404 to undefined without retrying", async () => {
    const fetchSpy = respond(404, { error: { code: "not_found", message: "no" } });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useNodePolling("n1", true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("useNodePoller", () => {
  it("fetches the poller answer", async () => {
    const fetchSpy = respond(200, poller);
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useNodePoller("n1", true), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(poller));
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/nodes/n1/poller");
    expect(client.getQueryData(["node-poller", "n1"])).toEqual(poller);
  });

  it("does not fetch when disabled", async () => {
    const fetchSpy = respond(200, poller);
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useNodePoller("n1", false), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves a 404 to undefined without retrying", async () => {
    const fetchSpy = respond(404, { error: { code: "not_found", message: "no" } });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useNodePoller("n1", true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
