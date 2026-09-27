import { afterEach, expect, it, vi } from "vitest";
import { getObserverComparison, getObserverActivity, getObserver } from "../../src/api/client";

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

it("sends the shared activity anchor without altering the selected range", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ points: [] }) });
  vi.stubGlobal("fetch", fetcher);
  await getObserverActivity("a", "168h", "1h", 123456789);
  expect(Object.fromEntries(new URL(fetcher.mock.calls[0][0]).searchParams)).toEqual({ range: "168h", interval: "1h", until: "123456789" });
});

it.each([ { stats: { noise_floor: -117 } }, btoa('{"stats":{"noise_floor":-117}}') ])("reads both object and legacy byte-encoded status metadata", async metadata => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "a", statusMetadata: metadata }) }));
  expect((await getObserver("a")).statusMetadata).toEqual({ stats: { noise_floor: -117 } });
});

it.each(["not base64!", btoa('null'), btoa('[]')])("ignores malformed metadata without losing the observer", async metadata => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "a", statusMetadata: metadata }) }));
  const observer = await getObserver("a");
  expect(observer.id).toBe("a"); expect(observer.statusMetadata).toBeUndefined();
});
