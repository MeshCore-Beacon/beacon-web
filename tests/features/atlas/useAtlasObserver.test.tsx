import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as api from "../../../src/api/client";
import { ApiError } from "../../../src/api/client";
import { shouldRetryQuery } from "../../../src/api/rate-limit";
import { ATLAS_REFRESH_MS } from "../../../src/features/atlas/useAtlas";
import { useAtlasObserver } from "../../../src/features/atlas/useAtlasObserver";
import type { Observer } from "../../../src/features/observers/types";

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getObserver: vi.fn(),
  getObserverActivity: vi.fn(),
  getObserverTelemetry: vi.fn(),
}));

const id = "33333333-3333-4333-8333-333333333333";
const observer = { id, status: "online", iata: "YKF", publicKey: "ab".repeat(32), firstSeen: 1, lastSeen: 2, observationCount: 5, brokers: [], uptimeSeconds: 400 } as Observer;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });
  vi.mocked(api.getObserver).mockResolvedValue(observer);
  vi.mocked(api.getObserverActivity).mockResolvedValue({ range: "24h", interval: "1h", radio: null, payloadTypes: [], points: [{ t: Date.now(), observations: 4, snrAvg: 3, snrMin: null, rssiAvg: null, airtimeMs: null }] });
  vi.mocked(api.getObserverTelemetry).mockResolvedValue({ range: "24h", interval: "1h", points: [] });
});
afterEach(() => {
  client.clear();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useAtlasObserver", () => {
  it("cancels all in-flight observer requests on unmount", async () => {
    vi.mocked(api.getObserver).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getObserverActivity).mockImplementation(() => new Promise(() => {}));
    vi.mocked(api.getObserverTelemetry).mockImplementation(() => new Promise(() => {}));
    const view = renderHook(() => useAtlasObserver(id, "24h", true, true), { wrapper });
    await tick(10);
    const signals = [vi.mocked(api.getObserver).mock.calls[0]![1]!, vi.mocked(api.getObserverActivity).mock.calls[0]![4]!, vi.mocked(api.getObserverTelemetry).mock.calls[0]![4]!];
    expect(signals.every(signal => !signal.aborted)).toBe(true);
    view.unmount();
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });
  it("loads the observer right away but activity and telemetry only while the view is open", async () => {
    const { result, rerender } = renderHook(({ open }) => useAtlasObserver(id, "24h", true, open), { wrapper, initialProps: { open: false } });
    await tick(10);
    expect(result.current.observer.data).toEqual(observer);
    expect(api.getObserverActivity).not.toHaveBeenCalled();
    rerender({ open: true });
    await tick(10);
    expect(result.current.sample.heard).toBe(4);
    expect(api.getObserverActivity).toHaveBeenCalledWith(id, "24h", "1h", undefined, expect.any(AbortSignal));
    expect(api.getObserverTelemetry).toHaveBeenCalledWith(id, "24h", "1h", undefined, expect.any(AbortSignal));
    expect(result.current.sample.uptime).toBe(400);
  });

  it("polls open queries once a minute and asks for 72h at the 3d window", async () => {
    const { result } = renderHook(() => useAtlasObserver(id, "3d", true, true), { wrapper });
    await tick(10);
    expect(result.current.sample.heard).toBe(4);
    expect(api.getObserverActivity).toHaveBeenLastCalledWith(id, "72h", "1h", undefined, expect.any(AbortSignal));
    await tick(ATLAS_REFRESH_MS + 50);
    expect(api.getObserverActivity).toHaveBeenCalledTimes(2);
    expect(api.getObserver).toHaveBeenCalledTimes(2);
  });

  it("treats a 404 as an unsupported server: dashes, no retry, no further polling of that query", async () => {
    vi.mocked(api.getObserverActivity).mockRejectedValue(new ApiError(404, "not_found", "no"));
    const { result } = renderHook(() => useAtlasObserver(id, "24h", true, true), { wrapper });
    await tick(10);
    expect(result.current.unsupported).toBe(true);
    expect(result.current.sample.heard).toBeNull();
    await tick(ATLAS_REFRESH_MS + 50);
    expect(api.getObserverActivity).toHaveBeenCalledTimes(1);
    expect(api.getObserverTelemetry).toHaveBeenCalledTimes(2);
  });

  it("does nothing without an observer id", () => {
    renderHook(() => useAtlasObserver(null, "24h", true, true), { wrapper });
    expect(api.getObserver).not.toHaveBeenCalled();
  });
});
