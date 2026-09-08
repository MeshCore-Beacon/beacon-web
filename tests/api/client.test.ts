import { afterEach, describe, expect, it, vi } from "vitest";
import { getPackets, getNodesPage, getObserversPage, getScopes, getKnownRoutesPage, searchKnownRoutes, getChannels, getChannelMessagesPage, getTraces, getTraceDetail, getStatsOverview, getTopObservers, getTopAdvertisers, getTopTalkers, getStatsNodeTypes, getClockDrift, getIataBorder } from "../../src/api/client";
import type { Feature, Polygon } from "geojson";
import type { NodeSummary } from "../../src/features/nodes/types";
import type { ObserverSummary } from "../../src/features/observers/types";
import type { ChannelMessage, ChannelSummary } from "../../src/features/channels/types";
import type { KnownRoute, TraceTagSummary, TraceDetail } from "../../src/types/api";
import { getRateLimitedUntil, noteRequestOk } from "../../src/api/rate-limit";
import { RATE_LIMIT_DEFAULT_MS } from "../../src/lib/constants";

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
  vi.useRealTimers();
  noteRequestOk();
});

describe("getPackets", () => {
  it("forwards plural filters as comma-separated values (routeType 0 survives, scope is encoded)", async () => {
    const getUrl = mockFetchOnce({ items: [], nextCursor: null, hasMore: false });

    await getPackets(["YOW"], { payloadTypes: [2, 4], routeTypes: [0], scopes: ["#bc", "#west"] });

    const url = new URL(getUrl());
    expect(url.pathname).toContain("/packets");
    expect(url.searchParams.get("payloadTypes")).toBe("2,4");
    expect(url.searchParams.get("routeTypes")).toBe("0"); // single value 0 survives
    expect(url.searchParams.get("scopes")).toBe("#bc,#west");
  });

  it("omits the filter params when none are given", async () => {
    const getUrl = mockFetchOnce({ items: [], nextCursor: null, hasMore: false });

    await getPackets(["YOW"], { cursor: 100 });

    const url = new URL(getUrl());
    expect(url.searchParams.has("payloadTypes")).toBe(false);
    expect(url.searchParams.has("routeTypes")).toBe(false);
    expect(url.searchParams.has("scopes")).toBe(false);
    expect(url.searchParams.get("cursor")).toBe("100");
    expect(url.searchParams.get("limit")).toBe("50");
  });
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

  it("forwards the pubkeyPrefix search param", async () => {
    const getUrl = mockFetchOnce({ items: [], nextCursor: null, hasMore: false });

    await getNodesPage(["YYZ"], { pubkeyPrefix: "a1b2" });

    const url = getUrl();
    expect(url).toContain("/nodes");
    expect(url).toContain("pubkeyPrefix=a1b2");
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

describe("getChannels", () => {
  it.each([1234, "v1:1700000000000123:50"])("sends cursor %s using the compatible parameter", async (cursor) => {
    const getUrl = mockFetchOnce({ items: [], hasMore: false });
    await getChannels({ cursor });
    const params = new URL(getUrl()).searchParams;
    expect(params.get(typeof cursor === "string" ? "pageCursor" : "cursor")).toBe(String(cursor));
    expect(params.has(typeof cursor === "string" ? "cursor" : "pageCursor")).toBe(false);
  });

  const channel: ChannelSummary = {
    id: 1,
    name: "Public",
    channelHash: "8b",
    lastSeen: 1000,
    isHashtag: false,
    keyKnown: true,
  };

  it("sends a single-IATA region as the singular iata param the server honors", async () => {
    const page = { items: [channel], nextCursor: 900, hasMore: true };
    const getUrl = mockFetchOnce(page);

    const channels = await getChannels({ iatas: ["YYZ"] });

    const url = new URL(getUrl());
    expect(url.pathname).toContain("/channels");
    expect(url.searchParams.get("iata")).toBe("YYZ");
    expect(url.searchParams.has("iatas")).toBe(false);
    expect(channels).toEqual(page);
  });

  it("keeps the comma-joined iatas param for multi-IATA regions", async () => {
    const getUrl = mockFetchOnce({ items: [] });

    await getChannels({ iatas: ["YOW", "YYZ"] });

    const url = new URL(getUrl());
    expect(url.searchParams.get("iatas")).toBe("YOW,YYZ");
    expect(url.searchParams.has("iata")).toBe(false);
  });

  it("omits both iata params for all regions", async () => {
    const getUrl = mockFetchOnce({ items: [] });

    await getChannels();

    const url = new URL(getUrl());
    expect(url.searchParams.has("iata")).toBe(false);
    expect(url.searchParams.has("iatas")).toBe(false);
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

describe("stats endpoints", () => {
  it("joins the region's IATAs into the iatas param", async () => {
    const getUrl = mockFetchOnce({ totalPackets: 0 });

    await getStatsOverview(["YOW", "YYZ"]);

    const url = new URL(getUrl());
    expect(url.pathname).toContain("/stats/overview");
    expect(url.searchParams.get("iatas")).toBe("YOW,YYZ");
  });

  it("omits iatas for all regions and still forwards the rest", async () => {
    const getUrl = mockFetchOnce([]);

    await getTopObservers(undefined, 1700000000000, 15);

    const url = new URL(getUrl());
    expect(url.searchParams.has("iatas")).toBe(false);
    expect(url.searchParams.get("since")).toBe("1700000000000");
    expect(url.searchParams.get("limit")).toBe("15");
  });

  it("hits /stats/top-advertisers with iatas/since/limit", async () => {
    const getUrl = mockFetchOnce([]);

    await getTopAdvertisers(["YOW", "YYZ"], 1700000000000, 10);

    const url = new URL(getUrl());
    expect(url.pathname).toContain("/stats/top-advertisers");
    expect(url.searchParams.get("iatas")).toBe("YOW,YYZ");
    expect(url.searchParams.get("since")).toBe("1700000000000");
    expect(url.searchParams.get("limit")).toBe("10");
  });

  it("hits /stats/top-talkers with iatas/since/limit", async () => {
    const getUrl = mockFetchOnce([]);

    await getTopTalkers(["YOW"], 1700000000000, 8);

    const url = new URL(getUrl());
    expect(url.pathname).toContain("/stats/top-talkers");
    expect(url.searchParams.get("iatas")).toBe("YOW");
    expect(url.searchParams.get("since")).toBe("1700000000000");
    expect(url.searchParams.get("limit")).toBe("8");
  });

  it("hits /stats/node-types with the region's IATAs", async () => {
    const getUrl = mockFetchOnce([{ nodeType: 2, nodeTypeName: "repeater", count: 12 }]);

    await getStatsNodeTypes(["YOW", "YYZ"]);

    const url = new URL(getUrl());
    expect(url.pathname).toContain("/stats/node-types");
    expect(url.searchParams.get("iatas")).toBe("YOW,YYZ");
  });

  it("hits /stats/clock-drift with iatas/limit", async () => {
    const getUrl = mockFetchOnce([]);

    await getClockDrift(["YOW", "YYZ"], 100);

    const url = new URL(getUrl());
    expect(url.pathname).toContain("/stats/clock-drift");
    expect(url.searchParams.get("iatas")).toBe("YOW,YYZ");
    expect(url.searchParams.get("limit")).toBe("100");
  });
});

describe("getIataBorder", () => {
  // this endpoint can 204 (empty body) or send a literal `null`, so mock the status explicitly
  function mockStatus(status: number, body: unknown): () => string {
    let calledUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calledUrl = url;
        return {
          ok: status >= 200 && status < 300,
          status,
          statusText: "status",
          headers: new Headers(),
          json: async () => {
            if (status === 204) throw new Error("no body to parse");
            return body;
          },
        } as Response;
      }),
    );
    return () => calledUrl;
  }

  const feature: Feature<Polygon> = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  };

  it("requests /iatas/{iata}/border", async () => {
    const getUrl = mockStatus(200, feature);
    await getIataBorder("YOW");
    expect(new URL(getUrl()).pathname).toContain("/iatas/YOW/border");
  });

  it("returns null for a 204 (no border configured) without parsing a body", async () => {
    mockStatus(204, undefined);
    await expect(getIataBorder("YOW")).resolves.toBeNull();
  });

  it("treats a literal null body as no border", async () => {
    mockStatus(200, null);
    await expect(getIataBorder("YOW")).resolves.toBeNull();
  });

  it("returns the GeoJSON Feature when a border exists", async () => {
    mockStatus(200, feature);
    await expect(getIataBorder("YOW")).resolves.toEqual(feature);
  });

  it("surfaces a 429 with the same ApiError shape as request()", async () => {
    mockStatus(429, { error: { code: "rate_limited", message: "slow down" } });
    const err = await getIataBorder("YOW").catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "ApiError", status: 429, code: "rate_limited" });
  });
});

describe("error responses", () => {
  function mockError(status: number, body: unknown, headers: Record<string, string> = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status,
        statusText: "status",
        headers: new Headers(headers),
        json: async () => body,
      }) as unknown as Response),
    );
  }
  const limited = { error: { code: "rate_limited", message: "slow down" } };

  it("a 429 throws an ApiError carrying status, code and retryAfterMs from the header", async () => {
    mockError(429, limited, { "Retry-After": "12" });
    const err = await getScopes().catch((e: unknown) => e);
    expect(err).toMatchObject({ name: "ApiError", status: 429, code: "rate_limited", retryAfterMs: 12_000 });
  });

  it("a 429 without Retry-After leaves retryAfterMs undefined", async () => {
    mockError(429, limited);
    const err = await getScopes().catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 429, retryAfterMs: undefined });
  });

  it("a 429 marks the app rate-limited for Retry-After", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    mockError(429, limited, { "Retry-After": "12" });
    await getScopes().catch(() => {});
    expect(getRateLimitedUntil()).toBe(1_012_000);
  });

  it("a 429 without the header uses the default window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    mockError(429, limited);
    await getScopes().catch(() => {});
    expect(getRateLimitedUntil()).toBe(1_000_000 + RATE_LIMIT_DEFAULT_MS);
  });

  it("the next successful request clears the rate-limited state", async () => {
    mockError(429, limited);
    await getScopes().catch(() => {});
    expect(getRateLimitedUntil()).not.toBeNull();

    mockFetchOnce([]);
    await getScopes();
    expect(getRateLimitedUntil()).toBeNull();
  });

  it("a plain 500 is not treated as rate limiting", async () => {
    mockError(500, { error: { code: "internal", message: "boom" } });
    const err = await getScopes().catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 500, code: "internal" });
    expect(getRateLimitedUntil()).toBeNull();
  });
});
