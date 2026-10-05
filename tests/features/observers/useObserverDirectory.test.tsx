import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { WsManager } from "../../../src/api/ws-manager";
import type { WsObserverStatus } from "../../../src/types/ws";
import { useObserverDirectory, type ObserverDirectoryOptions } from "../../../src/features/observers/useObserverDirectory";
import { directoryPage, directoryRow } from "../../fixtures/observer-directory";

const region = { regionKey: "YOW", iatas: ["YOW"], isResolved: true, emptyRegion: undefined as string | undefined };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
let statusHandler: (data: WsObserverStatus["data"]) => void;
const ws = { onObserverStatus: (handler: typeof statusHandler) => { statusHandler = handler; return () => {}; } } as WsManager;
const defaults: ObserverDirectoryOptions = { sort: "traffic", search: "", status: "", type: "", broker: "", scope: "" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = (status: number, message = "failed") => reply({ error: { code: "error", message } }, status);
let requests: URL[];
let respond: (url: URL) => Response | Promise<Response>;

beforeEach(() => {
  requests = [];
  region.isResolved = true; region.iatas = ["YOW"]; region.regionKey = "YOW"; region.emptyRegion = undefined;
  respond = () => reply(directoryPage([directoryRow("first")]));
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input); requests.push(url);
    return url.search === "?limit=1" ? reply(directoryPage([])) : respond(url);
  }));
});
afterEach(() => vi.unstubAllGlobals());
function view(options = defaults) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(p => useObserverDirectory(ws, p), { wrapper, initialProps: options });
}
const listingRequests = () => requests.filter(url => url.search !== "?limit=1");

it("loads only the first page initially, then returns later counts beyond 200 without duplicates", async () => {
  const first = Array.from({ length: 200 }, (_, i) => directoryRow(String(i), 1000 - i));
  let finish: (response: Response) => void;
  respond = url => url.searchParams.has("cursor")
    ? new Promise(resolve => { finish = resolve; })
    : reply(directoryPage(first, { hasMore: true, nextCursor: 200 }));
  const { result } = view();
  await waitFor(() => expect(result.current.observers).toHaveLength(200));
  expect(listingRequests()).toHaveLength(1);
  expect(listingRequests()[0].pathname).toMatch(/\/observers\/directory$/);
  expect(result.current.observerTypes).toEqual(["meshcoretomqtt", "RemoteTerm"]);
  act(() => { void result.current.loadMore(); void result.current.loadMore(); });
  await waitFor(() => expect(listingRequests()).toHaveLength(2));
  expect(Object.fromEntries(listingRequests()[1].searchParams)).toEqual({
    iatas: "YOW", sort: "traffic", since: "1790557200000", until: "1791162000000", cursor: "200", limit: "200",
  });
  await act(async () => finish!(reply(directoryPage([first[199], directoryRow("later", 25), directoryRow("zero", 0)], { maxObservationCount: 2000 }))));
  await waitFor(() => expect(result.current.observers).toHaveLength(202));
  expect(result.current.observers.at(-2)?.observationCount).toBe(25);
  expect(result.current.observers.at(-1)?.observationCount).toBe(0);
  expect(result.current.maxObservationCount).toBe(1000);
  expect(result.current.hasNextPage).toBe(false);
});

it("sends every filter but lets the server choose the rolling seven-day window", async () => {
  const { result } = view({ ...defaults, search: "roof", status: "online", type: "RemoteTerm", broker: "local", scope: "#test" });
  await waitFor(() => expect(result.current.observers).toHaveLength(1));
  const p = listingRequests()[0].searchParams;
  expect(Object.fromEntries(p)).toMatchObject({ iatas: "YOW", name: "roof", status: "online", type: "RemoteTerm", broker: "local", scope: "#test", sort: "traffic" });
  expect(p.has("since")).toBe(false);
  expect(p.has("until")).toBe(false);
});

it("ignores a slow old-filter page and restarts for new filters and sort", async () => {
  let finish: (response: Response) => void;
  respond = url => url.searchParams.get("name") === "new"
    ? reply(directoryPage([directoryRow("new")], { effectiveSort: "name" }))
    : url.searchParams.has("cursor") ? new Promise(resolve => { finish = resolve; })
    : reply(directoryPage([directoryRow("old")], { hasMore: true, nextCursor: 1 }));
  const { result, rerender } = view();
  await waitFor(() => expect(result.current.observers[0]?.id).toBe("old"));
  act(() => { void result.current.loadMore(); });
  await waitFor(() => expect(listingRequests()).toHaveLength(2));
  rerender({ ...defaults, search: "new", sort: "name" });
  await waitFor(() => expect(result.current.observers.map(o => o.id)).toEqual(["new"]));
  await act(async () => finish!(reply(directoryPage([directoryRow("stale")]))));
  expect(result.current.observers.map(o => o.id)).toEqual(["new"]);
  expect(listingRequests().at(-1)?.searchParams.get("sort")).toBe("name");
  expect(listingRequests().at(-1)?.searchParams.has("cursor")).toBe(false);
});

it("restarts at page one when the effective sort changes between pages", async () => {
  let firstPages = 0;
  respond = url => url.searchParams.has("cursor")
    ? reply(directoryPage([directoryRow("wrong-order")], { effectiveSort: "name" }))
    : reply(++firstPages === 1 ? directoryPage([directoryRow("old")], { hasMore: true, nextCursor: 1 })
      : directoryPage([directoryRow("fresh")], { effectiveSort: "name" }));
  const { result } = view();
  await waitFor(() => expect(result.current.observers[0]?.id).toBe("old"));
  act(() => { void result.current.loadMore(); });
  await waitFor(() => expect(result.current.observers.map(o => o.id)).toEqual(["fresh"]));
  expect(firstPages).toBe(2);
});

it("stops automatic restart loops if effective sort keeps changing, and allows a manual refresh", async () => {
  let firstPages = 0;
  respond = url => url.searchParams.has("cursor")
    ? reply(directoryPage([directoryRow("wrong-order")], { effectiveSort: "name" }))
    : (++firstPages, reply(directoryPage([directoryRow("first")], { hasMore: true, nextCursor: 1 })));
  const { result } = view();
  await waitFor(() => expect(result.current.observers).toHaveLength(1));
  await act(async () => { await result.current.loadMore(); });
  await waitFor(() => expect(firstPages).toBe(2));
  await waitFor(() => expect(result.current.hasNextPage).toBe(true));
  await act(async () => { await result.current.loadMore(); });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(firstPages).toBe(2);
  expect(result.current.observers.map(o => o.id)).toEqual(["first"]);
  await act(async () => { await result.current.retry(); });
  await waitFor(() => expect(firstPages).toBe(3));
});

it("keeps rows on transient continuation errors and retries the same cursor", async () => {
  let attempts = 0;
  respond = url => !url.searchParams.has("cursor") ? reply(directoryPage([directoryRow("first")], { hasMore: true, nextCursor: 1 }))
    : ++attempts === 1 ? failure(503) : reply(directoryPage([directoryRow("second")]));
  const { result } = view();
  await waitFor(() => expect(result.current.observers).toHaveLength(1));
  await act(async () => { await result.current.loadMore(); });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.observers[0].id).toBe("first");
  await act(async () => { await result.current.retry(); });
  await waitFor(() => expect(result.current.observers).toHaveLength(2));
  expect(listingRequests()[1].search).toBe(listingRequests()[2].search);
});

it("stops on a repeated cursor and leaves loaded membership/order/counts intact on live status", async () => {
  respond = url => reply(directoryPage([directoryRow(url.searchParams.has("cursor") ? "second" : "first")], { hasMore: true, nextCursor: 1 }));
  const { result } = view();
  await waitFor(() => expect(result.current.observers).toHaveLength(1));
  await act(async () => { await result.current.loadMore(); });
  await waitFor(() => expect(result.current.hasNextPage).toBe(false));
  act(() => statusHandler({ observerId: "first", online: false, displayName: "renamed", lastStatusAt: Date.now() - 600000 } as WsObserverStatus["data"]));
  await waitFor(() => expect(result.current.observers[0].status).toBe("offline"));
  expect(result.current.observers.map(o => [o.id, o.displayName, o.observationCount])).toEqual([["first", "Receiver first", 100], ["second", "Receiver second", 100]]);
});

it("does not request any directory while the region is unresolved", async () => {
  region.isResolved = false;
  view();
  await act(async () => {});
  expect(requests).toHaveLength(0);
});

it("passes an empty region by slug instead of loading all observers", async () => {
  region.iatas = []; region.emptyRegion = "empty";
  const { result } = view();
  await waitFor(() => expect(result.current.observers).toHaveLength(1));
  expect(listingRequests()[0].searchParams.get("region")).toBe("empty");
});

it.each([404, 400])("shows upgrade required only for the documented legacy probe response (%s), and can detect an upgrade", async status => {
  const fetcher = vi.mocked(fetch);
  fetcher.mockImplementation(async input => {
    const url = new URL(String(input)); requests.push(url);
    return failure(status, "failed to parse observer UUID");
  });
  const { result } = view();
  await waitFor(() => expect(result.current.unsupported).toBe(true));
  expect(requests.map(u => u.search)).toEqual(["?limit=1"]);
  fetcher.mockImplementation(async input => {
    const url = new URL(String(input)); requests.push(url);
    return reply(directoryPage([directoryRow("upgraded")]));
  });
  await act(async () => { await result.current.retry(); });
  await waitFor(() => expect(result.current.observers[0]?.id).toBe("upgraded"));
});

it.each([400, 500, 503])("does not mistake a probe failure (%s) for an older server", async status => {
  vi.mocked(fetch).mockResolvedValue(failure(status, "different failure"));
  const { result } = view();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.unsupported).toBe(false);
});

it("rejects a successful probe lacking the directory contract", async () => {
  vi.mocked(fetch).mockResolvedValue(reply({ items: [], hasMore: false }));
  const { result } = view();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.unsupported).toBe(false);
});

it("repeats every filter on continuation using the response window, then clears pages on refresh", async () => {
  let version = 0;
  respond = url => reply(directoryPage([directoryRow(url.searchParams.has("cursor") ? "later" : `first-${version}`)], {
    hasMore: !url.searchParams.has("cursor"), nextCursor: url.searchParams.has("cursor") ? undefined : 200,
    maxObservationCount: version === 0 ? 1000 : 2000,
  }));
  const { result } = view({ ...defaults, search: "roof", type: "RemoteTerm", status: "online", broker: "local", scope: "#test" });
  await waitFor(() => expect(result.current.observers).toHaveLength(1));
  await act(async () => { await result.current.loadMore(); });
  await waitFor(() => expect(result.current.observers).toHaveLength(2));
  expect(Object.fromEntries(listingRequests()[1].searchParams)).toEqual({
    iatas: "YOW", sort: "traffic", name: "roof", type: "RemoteTerm", status: "online", broker: "local", scope: "#test",
    since: "1790557200000", until: "1791162000000", cursor: "200", limit: "200",
  });
  version = 1;
  await act(async () => { await result.current.refresh(); });
  await waitFor(() => expect(result.current.observers.map(o => o.id)).toEqual(["first-1"]));
  expect(result.current.maxObservationCount).toBe(2000);
  expect(listingRequests().at(-1)?.searchParams.has("cursor")).toBe(false);
});

it("starts a new first page with a server-chosen window on region changes", async () => {
  respond = url => reply(directoryPage([directoryRow(url.searchParams.get("iatas")!)]));
  const { result, rerender } = view();
  await waitFor(() => expect(result.current.observers[0]?.id).toBe("YOW"));
  region.iatas = ["YVR"]; region.regionKey = "YVR";
  rerender({ ...defaults });
  await waitFor(() => expect(result.current.observers.map(o => o.id)).toEqual(["YVR"]));
  const p = listingRequests().at(-1)!.searchParams;
  expect(p.has("cursor")).toBe(false);
  expect(p.has("since")).toBe(false);
  expect(p.has("until")).toBe(false);
});

it.each([undefined, 0])("stops when a nonterminal response has no usable cursor (%s)", async nextCursor => {
  respond = () => reply(directoryPage([directoryRow("first")], { hasMore: true, nextCursor }));
  const { result } = view();
  await waitFor(() => expect(result.current.observers).toHaveLength(1));
  expect(result.current.hasNextPage).toBe(false);
});

it("refreshes loaded rows each minute so fetched online status does not stay green indefinitely", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T12:15:00Z"));
  let online = true;
  respond = () => reply(directoryPage([{ ...directoryRow("first"), status: online ? "online" : "offline" }]));
  try {
    const { result } = view();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.observers[0]?.status).toBe("online");
    online = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.observers[0]?.status).toBe("offline");
    expect(listingRequests()).toHaveLength(2);
  } finally { vi.useRealTimers(); }
});

it("uses a fresh rolling window on periodic refresh and replaces all loaded pages atomically", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T12:15:23.456Z"));
  let generation = 0;
  let finishSecondPage: (response: Response) => void;
  const page = (part: string, end: number) => directoryPage([directoryRow(`${generation}-${part}`, generation ? 200 : 100)], {
    windowStart: end - 7 * 86400000, windowEnd: end,
    hasMore: part === "first", nextCursor: part === "first" ? 200 : undefined,
    maxObservationCount: generation ? 200 : 100,
  });
  respond = url => {
    const continuation = url.searchParams.has("cursor");
    if (generation && continuation) return new Promise(resolve => { finishSecondPage = resolve; });
    return reply(page(continuation ? "second" : "first", continuation ? Number(url.searchParams.get("until")) : Date.now()));
  };
  try {
    const { result } = view();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { await result.current.loadMore(); await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.observers.map(o => o.id)).toEqual(["0-first", "0-second"]);
    const oldEnd = result.current.windowEnd;
    generation = 1;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    const refreshFirst = listingRequests().at(-2)!.searchParams;
    const refreshNext = listingRequests().at(-1)!.searchParams;
    expect(refreshFirst.has("cursor")).toBe(false);
    expect(refreshFirst.has("since")).toBe(false);
    expect(refreshFirst.has("until")).toBe(false);
    expect(Number(refreshNext.get("until"))).toBeGreaterThan(oldEnd!);
    expect(Number(refreshNext.get("until")) - Number(refreshNext.get("since"))).toBe(7 * 86400000);
    expect(result.current.windowEnd).toBe(oldEnd);
    expect(result.current.observers.map(o => o.id)).toEqual(["0-first", "0-second"]);
    expect(result.current.maxObservationCount).toBe(100);
    await act(async () => {
      finishSecondPage!(reply(page("second", Number(refreshNext.get("until")))));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.observers.map(o => o.id)).toEqual(["1-first", "1-second"]);
    expect(result.current.windowEnd).toBe(Number(refreshNext.get("until")));
    expect(result.current.maxObservationCount).toBe(200);
  } finally { vi.useRealTimers(); }
});

it("ignores a pending old-window continuation when manual refresh obtains a new window", async () => {
  let finishOld: (response: Response) => void;
  let fresh = false;
  respond = url => url.searchParams.has("cursor") ? new Promise(resolve => { finishOld = resolve; })
    : reply(directoryPage([directoryRow(fresh ? "fresh" : "old")], {
      windowStart: fresh ? 1790557260123 : 1790557200000, windowEnd: fresh ? 1791162060123 : 1791162000000,
      hasMore: !fresh, nextCursor: fresh ? undefined : 200,
    }));
  const { result } = view();
  await waitFor(() => expect(result.current.observers[0]?.id).toBe("old"));
  act(() => { void result.current.loadMore(); });
  await waitFor(() => expect(listingRequests()).toHaveLength(2));
  fresh = true;
  await act(async () => { await result.current.refresh(); });
  await waitFor(() => expect(result.current.observers.map(o => o.id)).toEqual(["fresh"]));
  await act(async () => finishOld!(reply(directoryPage([directoryRow("stale")]))));
  expect(result.current.observers.map(o => o.id)).toEqual(["fresh"]);
  expect(result.current.windowEnd).toBe(1791162060123);
  expect(Object.fromEntries(listingRequests().at(-1)!.searchParams)).toEqual({ iatas: "YOW", sort: "traffic", limit: "200" });
});
