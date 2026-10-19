import { describe, expect, it, vi } from "vitest";
import { fetchPage, nextPageParam } from "../../src/api/paging";
import type { CursorPage } from "../../src/types/api";

const page = (over: Partial<CursorPage<unknown>>): CursorPage<unknown> => ({ items: [], nextCursor: null, hasMore: true, ...over });

describe("nextPageParam", () => {
  it("sends both cursors when the server returns both", () => {
    expect(nextPageParam(page({ nextCursor: 5, nextPageCursor: "v1:5000:ab" }))).toStrictEqual({ cursor: 5, pageCursor: "v1:5000:ab" });
  });
  it("sends only cursor for an older server (no nextPageCursor, or an empty one)", () => {
    expect(nextPageParam(page({ nextCursor: 5 }))).toStrictEqual({ cursor: 5 });
    expect(nextPageParam(page({ nextCursor: 5, nextPageCursor: "" }))).toStrictEqual({ cursor: 5 });
  });
  it("sends pageCursor alone when it is the only cursor", () => {
    expect(nextPageParam(page({ nextPageCursor: "v1:1:ab" }))).toStrictEqual({ pageCursor: "v1:1:ab" });
  });
  it("stops when hasMore is not true", () => {
    expect(nextPageParam(page({ hasMore: false, nextCursor: 5, nextPageCursor: "v1:5000:ab" }))).toBeUndefined();
    expect(nextPageParam({ items: [], nextCursor: 5 } as unknown as CursorPage<unknown>)).toBeUndefined();
  });
  it("returns undefined when hasMore is true but no cursor is present", () => {
    expect(nextPageParam(page({}))).toBeUndefined();
  });
  it("keeps a structured cursor as is", () => {
    const routeCursor = { lastSeen: 9, id: 3 };
    expect(nextPageParam({ items: [], nextCursor: routeCursor, hasMore: true })).toStrictEqual({ cursor: routeCursor });
  });
});

describe("fetchPage", () => {
  const invalid = Object.assign(new Error("invalid pageCursor"), { status: 400, code: "bad_request" });

  it("retries once with cursor alone after a 400 invalid pageCursor", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(invalid).mockResolvedValueOnce("page 2");
    await expect(fetchPage({ cursor: 5, pageCursor: "v1:5000:ab" }, fetch)).resolves.toBe("page 2");
    expect(fetch.mock.calls.map((c) => c[0])).toStrictEqual([{ cursor: 5, pageCursor: "v1:5000:ab" }, { cursor: 5 }]);
  });

  it("throws if the cursor-only retry fails too", async () => {
    const fetch = vi.fn().mockRejectedValue(invalid);
    await expect(fetchPage({ cursor: 5, pageCursor: "v1:5000:ab" }, fetch)).rejects.toBe(invalid);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors, or a page with no cursor to fall back to", async () => {
    const other = Object.assign(new Error("invalid cursor"), { status: 400, code: "bad_request" });
    const fetchOther = vi.fn().mockRejectedValue(other);
    await expect(fetchPage({ cursor: 5, pageCursor: "v1:5000:ab" }, fetchOther)).rejects.toBe(other);
    expect(fetchOther).toHaveBeenCalledTimes(1);
    const fetchAlone = vi.fn().mockRejectedValue(invalid);
    await expect(fetchPage({ pageCursor: "v1:5000:ab" }, fetchAlone)).rejects.toBe(invalid);
    expect(fetchAlone).toHaveBeenCalledTimes(1);
  });
});
