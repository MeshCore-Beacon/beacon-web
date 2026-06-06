import { afterEach, describe, expect, it, vi } from "vitest";
import { getNodesPage, getObserversPage } from "../../src/api/client";
import type { NodeSummary } from "../../src/features/nodes/types";
import type { ObserverSummary } from "../../src/features/observers/types";

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

  it("forwards the Nodes-table filters (type maps to typeName, multibyte flags)", async () => {
    const getUrl = mockFetchOnce({ items: [], nextCursor: null, hasMore: false });

    await getNodesPage(["YYZ"], {
      type: "repeater",
      name: "alpha",
      supportsMultibytePaths: "true",
      supportsMultibyteTraces: "false",
    });

    const url = getUrl();
    expect(url).toContain("typeName=repeater");
    expect(url).toContain("name=alpha");
    expect(url).toContain("supportsMultibytePaths=true");
    expect(url).toContain("supportsMultibyteTraces=false");
    expect(url).not.toContain("type="); // server param is typeName, not type
  });
});

describe("getObserversPage", () => {
  const observer: ObserverSummary = { id: "o1", iata: "YYZ", status: "online" };

  it("hits /observers with cursor + limit and returns the full cursor page", async () => {
    const getUrl = mockFetchOnce({ items: [observer], nextCursor: 99, hasMore: true });

    const page = await getObserversPage(["YYZ"], { cursor: 7 });

    const url = getUrl();
    expect(url).toContain("/observers");
    expect(url).toContain("iatas=YYZ");
    expect(url).toContain("cursor=7");
    expect(url).toContain("limit=50");
    expect(page).toEqual({ items: [observer], nextCursor: 99, hasMore: true });
  });

  it("forwards the Observers-table filters and omits cursor on the first page", async () => {
    const getUrl = mockFetchOnce({ items: [], nextCursor: null, hasMore: false });

    await getObserversPage(undefined, { status: "online", type: "rak", broker: "b1", name: "north" });

    const url = getUrl();
    expect(url).not.toContain("cursor=");
    expect(url).toContain("status=online");
    expect(url).toContain("type=rak");
    expect(url).toContain("broker=b1");
    expect(url).toContain("name=north");
  });
});
