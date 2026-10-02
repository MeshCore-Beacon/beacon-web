import { afterEach, expect, it, vi } from "vitest";
import { getStatsObservations, getStatsScopes, getStatsSeries, getTopNodes, getSignalStats, getPathStats } from "../../src/api/client";

afterEach(() => vi.unstubAllGlobals());

it("sends path window bounds, regional filters and cancellation", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => ({ ok: true, json: async () => ({}) }) as Response);
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  await getPathStats(0, 1000, ["YVR", "YYJ"], controller.signal);
  const url = new URL(fetcher.mock.calls[0]![0] as string);
  expect(url.pathname).toContain("/stats/paths");
  expect(Object.fromEntries(url.searchParams)).toEqual({ since: "0", until: "1000", iatas: "YVR,YYJ" });
  expect(fetcher.mock.calls[0]![1]).toEqual({ signal: controller.signal });
});

it("forwards region and cancellation to both aggregate endpoints, omitting an empty global filter", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => ({ ok: true, json: async () => [] }) as Response);
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  await getStatsScopes(["YVR", "YOW"], 5678, controller.signal);
  const scopesUrl = new URL(fetcher.mock.calls[0]![0] as string);
  expect(scopesUrl.searchParams.get("iatas")).toBe("YVR,YOW");
  expect(scopesUrl.searchParams.get("since")).toBe("5678");
  expect(fetcher.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  await getStatsScopes([], 5678);
  expect(new URL(fetcher.mock.calls[1]![0] as string).searchParams.has("iatas")).toBe(false);
  await getStatsObservations(["YOW"], 1234, controller.signal);
  const url = new URL(fetcher.mock.calls[2]![0] as string);
  expect(url.pathname).toContain("/stats/observations");
  expect(url.searchParams.get("since")).toBe("1234");
  expect(url.searchParams.get("iatas")).toBe("YOW");
});

it("sends explicit signal window bounds, regional filters and cancellation", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => ({ ok: true, json: async () => ({}) }) as Response);
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  await getSignalStats(0, 1000, ["YVR", "YYJ"], controller.signal);
  const url = new URL(fetcher.mock.calls[0]![0] as string);
  expect(url.pathname).toContain("/stats/signal");
  expect(Object.fromEntries(url.searchParams)).toEqual({ since: "0", until: "1000", iatas: "YVR,YYJ" });
  expect(fetcher.mock.calls[0]![1]).toEqual({ signal: controller.signal });
});

it("sends the series window, regional filters and cancellation", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => ({ ok: true, json: async () => ({}) }) as Response);
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  await getStatsSeries(0, 1000, ["YVR", "YYJ"], controller.signal);
  const url = new URL(fetcher.mock.calls[0]![0] as string);
  expect(url.pathname).toContain("/stats/series");
  expect(Object.fromEntries(url.searchParams)).toEqual({ since: "0", until: "1000", iatas: "YVR,YYJ" });
  expect(fetcher.mock.calls[0]![1]).toEqual({ signal: controller.signal });
});

it("windows top nodes by since", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => ({ ok: true, json: async () => [] }) as Response);
  vi.stubGlobal("fetch", fetcher);
  await getTopNodes(["YVR"], 1234, 10);
  const url = new URL(fetcher.mock.calls[0]![0] as string);
  expect(url.pathname).toContain("/stats/top-nodes");
  expect(Object.fromEntries(url.searchParams)).toEqual({ iatas: "YVR", since: "1234", limit: "10" });
});
