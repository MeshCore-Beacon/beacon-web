import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { shouldRetryQuery } from "../../../src/api/rate-limit";
import { useNodePolling, useNodeTelemetry } from "../../../src/features/nodes/useNodeTelemetry";

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const telemetry = { range: "24h", interval: "1h", polled: true, untrustedReadings: 0, points: [{ t: 1, readings: 2 }] };
const polling = { polled: true, latestReadingAt: 5, poller: null, standbys: [] };
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
    expect(client.getQueryData(["node-telemetry", "n1", "24h"])).toEqual(telemetry);
  });

  it("does not fetch when disabled or without an id", async () => {
    const fetchSpy = respond(200, telemetry);
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useNodeTelemetry("n1", "24h", false), { wrapper });
    renderHook(() => useNodeTelemetry(undefined, "24h", true), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves a 404 to undefined without retrying", async () => {
    const fetchSpy = respond(404, { error: { code: "not_found", message: "no" } });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useNodeTelemetry("n1", "168h", true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
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
