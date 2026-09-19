import { afterEach, expect, it, vi } from "vitest";
import { getObserverComparison } from "../../src/api/client";

afterEach(() => vi.unstubAllGlobals());

it("sends the complete comparison scope, including an epoch-zero start, and consumes cancellation", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ totalPackets: 0 }) });
  vi.stubGlobal("fetch", fetcher);
  const controller = new AbortController();
  await getObserverComparison(["YVR", "YYJ"], { observerA: "a", observerB: "b", since: 0, until: 1000 }, controller.signal);
  const [url, options] = fetcher.mock.calls[0];
  expect(new URL(url).pathname).toContain("/stats/observer-comparison");
  expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ observerA: "a", observerB: "b", since: "0", until: "1000", iatas: "YVR,YYJ" });
  expect(options.signal).toBe(controller.signal);
  controller.abort();
  expect(options.signal.aborted).toBe(true);
});
