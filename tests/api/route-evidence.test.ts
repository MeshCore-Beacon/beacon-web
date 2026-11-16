import { afterEach, expect, it, vi } from "vitest";
import { getRouteEvidence } from "../../src/api/client";

afterEach(() => vi.unstubAllGlobals());
it("encodes route identity and preserves the opaque cursor without numeric truncation", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], hasMore: false }) });
  vi.stubGlobal("fetch", fetcher);
  const cursor = "v1:YOW:abcdef:1:2:1234567890000001:9007199254740993";
  const signal = new AbortController().signal;
  await getRouteEvidence("Y/W", "abc/def", { pageCursor: cursor, limit: 50 }, signal);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.pathname).toContain("/routes/Y%2FW/abc%2Fdef/observations");
  expect(url.searchParams.get("pageCursor")).toBe(cursor);
  expect(url.searchParams.has("range")).toBe(false);
  expect(fetcher.mock.calls[0][1].signal).toBe(signal);
});

it("sends the selected path and fixed window together", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], hasMore: false }) });
  vi.stubGlobal("fetch", fetcher);
  await getRouteEvidence("YOW", "a".repeat(32), { since: 1000, until: 2000, hashSize: 2, pathBytes: "aa01bb02" });
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get("hashSize")).toBe("2");
  expect(url.searchParams.get("pathBytes")).toBe("aa01bb02");
  expect(url.searchParams.get("since")).toBe("1000");
  expect(url.searchParams.get("until")).toBe("2000");
});
