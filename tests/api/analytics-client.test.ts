import { afterEach, expect, it, vi } from "vitest";
import { getStatsObservations, getStatsScopes } from "../../src/api/client";

afterEach(() => vi.unstubAllGlobals());

it("forwards region and cancellation to both aggregate endpoints, omitting an empty global filter", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => ({ ok: true, json: async () => [] }) as Response);
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  await getStatsScopes(["YVR", "YOW"], controller.signal);
  expect(new URL(fetcher.mock.calls[0]![0] as string).searchParams.get("iatas")).toBe("YVR,YOW");
  expect(fetcher.mock.calls[0]![1]).toEqual({ signal: controller.signal });
  await getStatsScopes([]);
  expect(new URL(fetcher.mock.calls[1]![0] as string).searchParams.has("iatas")).toBe(false);
  await getStatsObservations(["YOW"], 1234, controller.signal);
  const url = new URL(fetcher.mock.calls[2]![0] as string);
  expect(url.pathname).toContain("/stats/observations");
  expect(url.searchParams.get("since")).toBe("1234");
  expect(url.searchParams.get("iatas")).toBe("YOW");
});
