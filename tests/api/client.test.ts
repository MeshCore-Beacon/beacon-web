import { afterEach, describe, expect, it, vi } from "vitest";
import { getNodesPage, getObserversPage, getScopes, getKnownRoutesPage, searchKnownRoutes, getChannelMessagesPage, getTraces, getTraceDetail } from "../../src/api/client";
import type { NodeSummary } from "../../src/features/nodes/types";
import type { ObserverSummary } from "../../src/features/observers/types";
import type { ChannelMessage } from "../../src/features/channels/types";
import type { KnownRoute, TraceTagSummary, TraceDetail } from "../../src/types/api";

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

describe("getScopes", () => {
  it("hits /scopes with no params and returns the scope-name array", async () => {
    const getUrl = mockFetchOnce(["#bc", "#west"]);

    const scopes = await getScopes();

    const url = getUrl();
    expect(url).toContain("/scopes");
    expect(url).not.toContain("?"); // no query params on the authoritative list
    expect(scopes).toEqual(["#bc", "#west"]);
  });
});

describe("getKnownRoutesPage", () => {
  const route: KnownRoute = {
    id: 7,
    iata: "YYC",
    hopCount: 1,
    hops: [{ nodeId: "n1", hashBytes: "be" }],
    firstSeen: 1,
    lastSeen: 2,
  };

  it("hits /routes, forwards iata/hopCount/cursor/limit", async () => {
    const getUrl = mockFetchOnce([route]);

    await getKnownRoutesPage({ iata: "YYC", hopCount: 1, cursor: 1234, limit: 50 });

    const url = getUrl();
    expect(url).toContain("/routes");
    expect(url).toContain("iata=YYC");
    expect(url).toContain("hopCount=1");
    expect(url).toContain("cursor=1234");
    expect(url).toContain("limit=50");
  });

  it("omits cursor on the first page and defaults the limit to 50", async () => {
    const getUrl = mockFetchOnce([]);

    await getKnownRoutesPage();

    const url = getUrl();
    expect(url).toContain("/routes");
    expect(url).not.toContain("cursor=");
    expect(url).toContain("limit=50");
    expect(url).not.toContain("iata=");
    expect(url).not.toContain("hopCount=");
  });

  it("wraps a full page: nextCursor is the last route's lastSeen", async () => {
    mockFetchOnce([{ ...route, lastSeen: 9 }]);

    // a page that fills the limit means there may be more — cursor = last (oldest) lastSeen
    const page = await getKnownRoutesPage({ limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(9);
  });

  it("wraps a short page: nextCursor null, hasMore false", async () => {
    mockFetchOnce([route]);

    const page = await getKnownRoutesPage({ limit: 50 });

    expect(page.items).toEqual([route]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});

describe("searchKnownRoutes", () => {
  it("hits /routes/search with the required iata/from/to", async () => {
    const getUrl = mockFetchOnce([]);

    await searchKnownRoutes("YYC", "6d", "be");

    const url = getUrl();
    expect(url).toContain("/routes/search");
    expect(url).toContain("iata=YYC");
    expect(url).toContain("from=6d");
    expect(url).toContain("to=be");
  });
});

describe("getChannelMessagesPage", () => {
  const msg: ChannelMessage = {
    id: 12,
    packetHash: "ab",
    channelHash: "cd",
    senderName: "alice",
    content: "hi",
    sentAt: 1000,
  };

  it("hits /channels/{id}/messages and forwards iatas/cursor/limit", async () => {
    const getUrl = mockFetchOnce({ items: [msg] });

    await getChannelMessagesPage(3, { iatas: ["YYZ"], cursor: 99, limit: 50 });

    const url = getUrl();
    expect(url).toContain("/channels/3/messages");
    expect(url).toContain("iatas=YYZ");
    expect(url).toContain("cursor=99");
    expect(url).toContain("limit=50");
  });

  it("omits cursor on the first page and defaults the limit to 50", async () => {
    const getUrl = mockFetchOnce({ items: [] });

    await getChannelMessagesPage(3);

    const url = getUrl();
    expect(url).not.toContain("cursor=");
    expect(url).toContain("limit=50");
  });

  it("wraps a full page: nextCursor is the last (oldest) message id", async () => {
    mockFetchOnce({ items: [{ ...msg, id: 5 }] });

    const page = await getChannelMessagesPage(3, { limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(5);
  });

  it("wraps a short page: nextCursor null, hasMore false", async () => {
    mockFetchOnce({ items: [msg] });

    const page = await getChannelMessagesPage(3, { limit: 50 });

    expect(page.items).toEqual([msg]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});

describe("getTraces", () => {
  const tag: TraceTagSummary = {
    traceTag: "04dc2b04",
    firstHeardAt: 1,
    lastHeardAt: 2,
    packetCount: 1,
    iataCount: 1,
  };

  it("hits /traces with comma-joined iatas + scope/limit and returns the bare array", async () => {
    const getUrl = mockFetchOnce([tag]);

    const traces = await getTraces(["YOW", "YYZ"], { scope: "#bc", limit: 200 });

    const url = getUrl();
    expect(url).toContain("/traces");
    expect(url).toContain("iatas=YOW%2CYYZ");
    expect(url).toContain("scope=%23bc");
    expect(url).toContain("limit=200");
    expect(traces).toEqual([tag]);
  });

  it("omits iatas for all regions", async () => {
    const getUrl = mockFetchOnce([]);

    await getTraces(undefined);

    const url = getUrl();
    expect(url).toContain("/traces");
    expect(url).not.toContain("iatas=");
  });
});

describe("getTraceDetail", () => {
  it("hits /traces/{tag} and returns the detail", async () => {
    const detail: TraceDetail = { traceTag: "04dc2b04", packets: [] };
    const getUrl = mockFetchOnce(detail);

    const result = await getTraceDetail("04dc2b04");

    expect(getUrl()).toContain("/traces/04dc2b04");
    expect(result).toEqual(detail);
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
