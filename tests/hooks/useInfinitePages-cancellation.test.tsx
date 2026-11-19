import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getNodesPage } from "../../src/api/client";
import { reservePage, resetPagePacer } from "../../src/api/page-pacer";
import { queryRetryDefaults } from "../../src/api/rate-limit";
import { useInfinitePages } from "../../src/hooks/useInfinitePages";
import type { NodePage, NodeSummary } from "../../src/features/nodes/types";

const nodeId = (node: NodeSummary) => node.id;
const node = (id: string): NodeSummary => ({ id, publicKey: id, name: id, nodeType: 2, nodeTypeName: "Repeater", lat: 1, lng: 1, iatas: [] });
const page = (...ids: string[]): NodePage => ({ items: ids.map(node), nextCursor: null, hasMore: false });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { ...queryRetryDefaults, gcTime: Infinity } } });
  const requests: { url: URL; signal?: AbortSignal; aborted: boolean; done: boolean; respond: (page: NodePage) => void }[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const signal = init?.signal ?? undefined;
    const request = { url: new URL(url), signal, aborted: false, done: false, respond: (body: NodePage) => {
      request.done = true;
      resolve(new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }));
    } };
    signal?.addEventListener("abort", () => {
      request.aborted = true;
      request.done = true;
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
    requests.push(request);
  })));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const useRegion = (region: string) => useInfinitePages({
    queryKey: ["cancel-nodes", region],
    queryFn: (cursor, signal) => getNodesPage([region], cursor, signal),
    getId: nodeId,
    auto: false,
  });
  return { client, requests, wrapper, useRegion };
}

beforeEach(resetPagePacer);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("paged request cancellation", () => {
  it("stops obsolete region reads and fetches a cancelled first page again when revisited", async () => {
    const { client, requests, wrapper, useRegion } = setup();
    const { result, rerender } = renderHook(({ region }) => useRegion(region), { wrapper, initialProps: { region: "A" } });
    await waitFor(() => expect(requests).toHaveLength(1));
    rerender({ region: "B" });
    await waitFor(() => expect(requests).toHaveLength(2));
    rerender({ region: "C" });
    await waitFor(() => expect(requests).toHaveLength(3));

    // Only the current view keeps network work alive, rather than all three delayed reads.
    expect(requests.filter((request) => !request.done)).toHaveLength(1);
    expect(requests.slice(0, 2).every((request) => request.aborted)).toBe(true);
    expect(client.getQueryState(["cancel-nodes", "A"])?.error).toBeNull();
    expect(client.getQueryState(["cancel-nodes", "A"])?.fetchStatus).toBe("idle");
    requests[2].respond(page("C"));
    await waitFor(() => expect(result.current.items.map(nodeId)).toEqual(["C"]));
    expect(result.current.isError).toBe(false);

    rerender({ region: "A" });
    await waitFor(() => expect(requests).toHaveLength(4));
    requests[3].respond(page("A"));
    await waitFor(() => expect(result.current.items.map(nodeId)).toEqual(["A"]));
  });

  it("keeps a shared read alive for another subscriber and reuses its completed cache", async () => {
    const { requests, wrapper, useRegion } = setup();
    const first = renderHook(() => useRegion("A"), { wrapper });
    const second = renderHook(() => useRegion("A"), { wrapper });
    await waitFor(() => expect(requests).toHaveLength(1));
    first.unmount();
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
    expect(requests[0].aborted).toBe(false);
    requests[0].respond(page("shared"));
    await waitFor(() => expect(second.result.current.items.map(nodeId)).toEqual(["shared"]));
    second.unmount();
    const again = renderHook(() => useRegion("A"), { wrapper });
    expect(again.result.current.items.map(nodeId)).toEqual(["shared"]);
    expect(requests).toHaveLength(1);
  });

  it("retains completed pages after cancelling the next page, then resumes the same cursor and dedupes", async () => {
    const { requests, wrapper, useRegion } = setup();
    const first = renderHook(() => useRegion("A"), { wrapper });
    await waitFor(() => expect(requests).toHaveLength(1));
    requests[0].respond({ ...page("a"), nextCursor: 2, nextPageCursor: "v1:2:a", hasMore: true });
    await waitFor(() => expect(first.result.current.items.map(nodeId)).toEqual(["a"]));
    act(() => first.result.current.loadMore());
    await waitFor(() => expect(requests).toHaveLength(2));
    first.unmount();
    expect(requests[1].aborted).toBe(true);

    const again = renderHook(() => useRegion("A"), { wrapper });
    expect(again.result.current.items.map(nodeId)).toEqual(["a"]);
    expect(again.result.current.isError).toBe(false);
    expect(requests).toHaveLength(2);
    act(() => again.result.current.loadMore());
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].url.search).toBe(requests[1].url.search);
    requests[2].respond(page("a", "b"));
    await waitFor(() => expect(again.result.current.items.map(nodeId)).toEqual(["a", "b"]));
    expect(again.result.current.isPaging).toBe(false);
  });

  it("returns a waiting page slot when the region changes before its timer fires", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 40; i++) reservePage();
    const queryFn = vi.fn(async (region: string) => ({ ...page(region), nextCursor: 1, hasMore: region === "A" }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { rerender } = renderHook(({ region }) => useInfinitePages({
      queryKey: ["waiting", region], queryFn: () => queryFn(region), getId: nodeId,
    }), { wrapper, initialProps: { region: "A" } });
    await act(() => vi.advanceTimersByTimeAsync(10));
    rerender({ region: "B" });
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(reservePage()).toBeLessThan(300); // A's unused reservation was returned.
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(queryFn.mock.calls.map(([region]) => region)).toEqual(["A", "B"]);
  });
});
