import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as api from "../../../src/api/client";
import { ApiError, isNotFound } from "../../../src/api/client";
import { noteRateLimited, noteRequestOk, shouldRetryQuery } from "../../../src/api/rate-limit";
import { ATLAS_MISSING_REFRESH_MS, ATLAS_REFRESH_MS, useAtlasNode } from "../../../src/features/atlas/useAtlas";
import type { Node } from "../../../src/features/nodes/types";

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getNode: vi.fn(),
  getNodeObservations: vi.fn(),
  getNodeActivity: vi.fn(),
  getNodesPage: vi.fn(),
}));

const pin = { id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "Pinned" };
const node = { ...pin, nodeType: 2, nodeTypeName: "REPEATER", knownNeighborCount: 1, lastSeen: Date.now(), iatas: [], lat: null, lng: null } as Node;
const activity = { windowStart: 0, windowEnd: 0, generatedAt: 0, range: "24h", summary: { observations: 1, snrAvg: 4, rssiAvg: -90, hopAvg: 1 }, points: [], latest: { packetHash: "ef".repeat(32), heardAt: Date.now() - 1000 } };
// The app's retry policy and back-off (1 s, then 2 s) so these tests exercise what ships.
const RETRY_MS = 3000;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
// Reads the status during render, as the card does, so the tracked query re-renders on an error.
const useProbe = () => {
  const value = useAtlasNode(pin, "24h", true);
  return { ...value, status: value.query.status };
};
const failNext = (times: number) => {
  for (let i = 0; i < times; i++) vi.mocked(api.getNode).mockRejectedValueOnce(new Error("down"));
};

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });
  vi.clearAllMocks();
  vi.mocked(api.getNode).mockResolvedValue(node);
  vi.mocked(api.getNodeActivity).mockResolvedValue(activity);
});
afterEach(() => {
  client.clear();
  noteRequestOk();
  vi.useRealTimers();
});

describe("atlas polling policy", () => {
  it("retries a transient failure twice, then keeps polling", async () => {
    vi.useFakeTimers();
    failNext(3);
    const { result } = renderHook(useProbe, { wrapper });
    await tick(10);
    expect(result.current.status).toBe("pending");
    await tick(RETRY_MS);
    expect(result.current.status).toBe("error");
    expect(api.getNode).toHaveBeenCalledTimes(3);
    await tick(ATLAS_REFRESH_MS);
    expect(result.current.node).toBeDefined();
    expect(api.getNode).toHaveBeenCalledTimes(4);
  });

  it("keeps the last good sample while a later poll fails, then recovers on the next", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(useProbe, { wrapper });
    await tick(10);
    expect(result.current.node).toBeDefined();
    failNext(3);
    await tick(ATLAS_REFRESH_MS + RETRY_MS);
    expect(result.current.status).toBe("error");
    expect(result.current.node).toBeDefined();
    expect(result.current.sample.total).toBe(1);
    expect(api.getNode).toHaveBeenCalledTimes(4);
    await tick(ATLAS_REFRESH_MS);
    expect(result.current.status).toBe("success");
    expect(api.getNode).toHaveBeenCalledTimes(5);
  });

  it("does not retry when the server says the node is gone", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getNode).mockRejectedValue(new ApiError(404, "not_found", "missing"));
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    const { result } = renderHook(useProbe, { wrapper });
    await tick(RETRY_MS);
    expect(result.current.status).toBe("error");
    expect(api.getNode).toHaveBeenCalledTimes(1);
    expect(api.getNodesPage).toHaveBeenCalledTimes(1);
  });

  it("pauses the poll while the API is throttling and resumes once the server is answering again", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAtlasNode(pin, "24h", true), { wrapper });
    await tick(10);
    expect(result.current.node).toBeDefined();
    act(() => noteRateLimited(5 * ATLAS_REFRESH_MS));
    await tick(2 * ATLAS_REFRESH_MS);
    expect(api.getNode).toHaveBeenCalledTimes(1);
    act(() => noteRequestOk());
    await tick(10);
    expect(api.getNode).toHaveBeenCalledTimes(2);
  });

  it("resumes on its own once the throttle window has expired", async () => {
    vi.useFakeTimers();
    renderHook(() => useAtlasNode(pin, "24h", true), { wrapper });
    await tick(10);
    act(() => noteRateLimited(2 * ATLAS_REFRESH_MS));
    await tick(2 * ATLAS_REFRESH_MS - 1_000);
    expect(api.getNode).toHaveBeenCalledTimes(1);
    // The window ends between minute ticks; the stale card refetches then, not at the next tick.
    await tick(2_000);
    expect(api.getNode).toHaveBeenCalledTimes(2);
  });

  it("checks a pin that is gone every ten minutes instead of every minute", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getNode).mockRejectedValue(new ApiError(404, "not_found", "gone"));
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    const { result } = renderHook(useProbe, { wrapper });
    await tick(10);
    expect(result.current.status).toBe("error");
    expect(isNotFound(result.current.query.error)).toBe(true);
    await tick(5 * ATLAS_REFRESH_MS);
    expect(api.getNode).toHaveBeenCalledTimes(1);
    await tick(ATLAS_MISSING_REFRESH_MS);
    expect(api.getNode).toHaveBeenCalledTimes(2);
  });
});

describe("useAtlasNode", () => {
  it("loads the node, then its hourly activity for the range, without the observation rows", async () => {
    const { result, rerender } = renderHook(({ range }: { range: "24h" | "3d" }) => useAtlasNode(pin, range, true), { wrapper, initialProps: { range: "24h" } });
    await waitFor(() => expect(result.current.sample.total).toBe(1));
    expect(api.getNodeActivity).toHaveBeenCalledWith(pin.id, "24h", expect.any(AbortSignal));
    expect(api.getNodeObservations).not.toHaveBeenCalled();
    expect(result.current.sample.snr).toBe(4);
    expect(result.current.sample.latest).toEqual(activity.latest);
    expect(result.current.activity).toEqual({ loading: false, unsupported: false, failed: false });
    rerender({ range: "3d" });
    await waitFor(() => expect(api.getNodeActivity).toHaveBeenCalledWith(pin.id, "72h", expect.any(AbortSignal)));
    expect(api.getNode).toHaveBeenCalledTimes(1);
  });

  it("does nothing while inactive and returns an empty sample", () => {
    const { result } = renderHook(() => useAtlasNode(pin, "3d", false), { wrapper });
    expect(api.getNode).not.toHaveBeenCalled();
    expect(api.getNodeActivity).not.toHaveBeenCalled();
    expect(result.current.node).toBeUndefined();
    expect(result.current.sample.counts).toHaveLength(72);
  });

  it("flags a server without the activity endpoint and stops asking it, while the node keeps polling", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getNodeActivity).mockRejectedValue(new ApiError(404, "not_found", "no"));
    const { result } = renderHook(() => useAtlasNode(pin, "24h", true), { wrapper });
    await tick(10);
    expect(result.current.node).toBeDefined();
    expect(result.current.activity).toEqual({ loading: false, unsupported: true, failed: false });
    await tick(3 * ATLAS_REFRESH_MS);
    expect(api.getNodeActivity).toHaveBeenCalledTimes(1);
    expect(api.getNode).toHaveBeenCalledTimes(4);
  });

  it("reports a failed activity load and tries again on the next poll", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) vi.mocked(api.getNodeActivity).mockRejectedValueOnce(new Error("down"));
    const { result } = renderHook(() => useAtlasNode(pin, "24h", true), { wrapper });
    await tick(10 + RETRY_MS);
    expect(result.current.activity).toEqual({ loading: false, unsupported: false, failed: true });
    await tick(ATLAS_REFRESH_MS);
    expect(result.current.sample.total).toBe(1);
  });

  it("pauses the activity poll while the API is throttling", async () => {
    vi.useFakeTimers();
    renderHook(() => useAtlasNode(pin, "24h", true), { wrapper });
    await tick(10);
    act(() => noteRateLimited(5 * ATLAS_REFRESH_MS));
    await tick(2 * ATLAS_REFRESH_MS);
    expect(api.getNodeActivity).toHaveBeenCalledTimes(1);
  });
});
