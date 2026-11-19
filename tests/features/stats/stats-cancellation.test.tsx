import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery, type QueryFunction } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { clockDriftQuery, nodeTypesQuery, payloadBreakdownQuery, radioPresetsQuery, topAdvertisersQuery, topNodesQuery, topObserversQuery, topTalkersQuery, type StatsScope } from "../../../src/features/stats/useStats";

const queries = [
  ["payload-breakdown", (s: StatsScope) => payloadBreakdownQuery(s, "24h")],
  ["top-nodes", (s: StatsScope) => topNodesQuery(s, "24h")],
  ["top-observers", (s: StatsScope) => topObserversQuery(s, "24h")],
  ["top-advertisers", (s: StatsScope) => topAdvertisersQuery(s, "24h", "flood")],
  ["top-talkers", (s: StatsScope) => topTalkersQuery(s, "24h")],
  ["radio-presets", (s: StatsScope) => radioPresetsQuery(s)],
  ["node-types", (s: StatsScope) => nodeTypesQuery(s)],
  ["clock-drift", (s: StatsScope) => clockDriftQuery(s)],
] as const;
const scope: StatsScope = { regionKey: "A", where: ["A"], isResolved: true };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const requests: { url: string; aborted: boolean; respond: () => void }[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const request = { url, aborted: false, respond: () => resolve(new Response("[]")) };
    init?.signal?.addEventListener("abort", () => {
      request.aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
    requests.push(request);
  })));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, requests, wrapper };
}
afterEach(() => vi.unstubAllGlobals());

describe("stats transport cancellation", () => {
  it.each(queries)("aborts %s HTTP work when its cancelled query loses the final subscriber", async (endpoint, build) => {
    const { client, requests, wrapper } = setup();
    const options = build(scope);
    const view = renderHook(() => useQuery({ ...options, queryFn: options.queryFn as QueryFunction<unknown> }), { wrapper });
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(new URL(requests[0].url).pathname).toBe(`/api/v1/stats/${endpoint}`);
    view.unmount();
    // Query already discards late results on dev; its transport must stop too.
    expect(client.getQueryState(options.queryKey)?.fetchStatus).toBe("idle");
    await act(async () => { requests[0].respond(); });
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
    expect(requests[0].aborted).toBe(true);
  });

  it("retains the readiness gate and cancels an obsolete region without replacing current data", async () => {
    const { requests, wrapper } = setup();
    const view = renderHook(({ region, ready }) => useQuery(payloadBreakdownQuery({ regionKey: region, where: [region], isResolved: ready }, "24h")), {
      wrapper, initialProps: { region: "A", ready: false },
    });
    expect(requests).toHaveLength(0);
    view.rerender({ region: "A", ready: true });
    await waitFor(() => expect(requests).toHaveLength(1));
    view.rerender({ region: "B", ready: true });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].aborted).toBe(true);
    expect(new URL(requests[1].url).searchParams.get("iatas")).toBe("B");
    requests[1].respond();
    await waitFor(() => expect(view.result.current.data).toEqual([]));
    expect(view.result.current.isError).toBe(false);
  });

  it("preserves another subscriber and reuses completed data without a new request", async () => {
    const { requests, wrapper } = setup();
    const first = renderHook(() => useQuery(payloadBreakdownQuery(scope, "24h")), { wrapper });
    const second = renderHook(() => useQuery(payloadBreakdownQuery(scope, "24h")), { wrapper });
    await waitFor(() => expect(requests).toHaveLength(1));
    first.unmount();
    expect(requests[0].aborted).toBe(false);
    requests[0].respond();
    await waitFor(() => expect(second.result.current.data).toEqual([]));
    second.unmount();
    const again = renderHook(() => useQuery(payloadBreakdownQuery(scope, "24h")), { wrapper });
    expect(again.result.current.data).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("allows intentional prefetches without subscribers to finish and populate the shared cache", async () => {
    const { client, requests, wrapper } = setup();
    const prefetched = client.prefetchQuery(payloadBreakdownQuery(scope, "24h"));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].aborted).toBe(false);
    requests[0].respond();
    await prefetched;
    const view = renderHook(() => useQuery(payloadBreakdownQuery(scope, "24h")), { wrapper });
    expect(view.result.current.data).toEqual([]);
    expect(requests).toHaveLength(1);
  });
});
