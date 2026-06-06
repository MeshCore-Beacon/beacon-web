import { afterEach, describe, expect, it, vi } from "vitest";
import { getNodesPage } from "../../src/api/client";
import type { NodeSummary } from "../../src/features/nodes/types";

// Capture the URL the client fetches and hand back a canned CursorPage.
function mockFetchOnce(body: unknown): () => string {
  let calledUrl = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calledUrl = url;
      return { ok: true, json: async () => body } as Response;
    }),
  );
  return () => calledUrl;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getNodesPage", () => {
  const node: NodeSummary = {
    id: "n1",
    publicKey: "pk",
    nodeType: 1,
    nodeTypeName: "repeater",
    name: "Node 1",
    lat: 1,
    lng: 2,
    iatas: [],
  };

  it("hits /nodes with cursor + limit and returns the full cursor page", async () => {
    const getUrl = mockFetchOnce({ items: [node], nextCursor: 4242, hasMore: true });

    const page = await getNodesPage(["YYZ"], { cursor: 100 });

    const url = getUrl();
    expect(url).toContain("/nodes");
    expect(url).toContain("iatas=YYZ");
    expect(url).toContain("cursor=100");
    expect(url).toContain("limit=50");
    expect(page).toEqual({ items: [node], nextCursor: 4242, hasMore: true });
  });

  it("omits cursor on the first page and defaults the limit to 50", async () => {
    const getUrl = mockFetchOnce({ items: [], nextCursor: null, hasMore: false });

    await getNodesPage(undefined);

    const url = getUrl();
    expect(url).not.toContain("cursor=");
    expect(url).toContain("limit=50");
  });
});
