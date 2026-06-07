import { API_BASE, DEFAULT_PAGE_SIZE } from "../lib/constants";
import type { CursorPage, PacketSummary, PacketDetail, IataCode, RegionSummary, Region, BrokerStatus, KnownRoute, TraceTagSummary, TraceDetail } from "../types/api";
import type { ChannelSummary, ChannelMessage } from "../features/channels/types";
import type { ObserverSummary, Observer } from "../features/observers/types";
import type { NodeSummary, Node, NodeObservation } from "../features/nodes/types";

// typed fetch wrapper with query params

class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await fetch(url.toString());

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: "unknown", message: res.statusText } }));
    throw new ApiError(res.status, body.error?.code ?? "unknown", body.error?.message ?? res.statusText);
  }

  return res.json();
}

// endpoint functions

// The region filter travels as the comma-separated `iatas` param; undefined/empty means all regions.
function iatasParam(iatas?: string[]): string | undefined {
  return iatas && iatas.length > 0 ? iatas.join(",") : undefined;
}

export function getPackets(
  iatas: string[] | undefined,
  params?: { cursor?: number; limit?: number; afterId?: number },
): Promise<CursorPage<PacketSummary>> {
  return request("/packets", {
    iatas: iatasParam(iatas),
    cursor: params?.cursor,
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
    afterId: params?.afterId,
  });
}

export function getPacketDetail(packetHash: string): Promise<PacketDetail> {
  return request(`/packets/${packetHash}`);
}

export function getIatas(): Promise<IataCode[]> {
  return request("/iatas");
}

export function getRegions(): Promise<RegionSummary[]> {
  return request("/regions");
}

export function getRegion(regionId: number): Promise<Region> {
  return request(`/regions/${regionId}`);
}

export async function getChannels(params?: { iatas?: string[]; limit?: number }): Promise<ChannelSummary[]> {
  const page = await request<{ items: ChannelSummary[] }>("/channels", {
    iatas: iatasParam(params?.iatas),
    limit: params?.limit,
  });
  return page.items;
}

// Channel messages come back as { items } ordered id DESC, so the last row is the page's oldest
// (smallest) id — the cursor for the next, older batch (the backend pages by id < cursor). Wrapped into
// a CursorPage so MessagePanel can load older history on demand via useInfiniteQuery.
export async function getChannelMessagesPage(
  channelId: number,
  params?: { iatas?: string[]; cursor?: number; limit?: number },
): Promise<CursorPage<ChannelMessage>> {
  const limit = params?.limit ?? DEFAULT_PAGE_SIZE;
  const page = await request<{ items: ChannelMessage[] }>(`/channels/${channelId}/messages`, {
    iatas: iatasParam(params?.iatas),
    cursor: params?.cursor,
    limit,
  });
  return toCursorPage(page.items, limit, (m) => m.id);
}

export function getBrokers(): Promise<BrokerStatus[]> {
  return request("/brokers");
}

// The authoritative list of configured transport scope names (e.g. "#bc", "#west"), used to populate
// the scope filter dropdowns. The no-param /scopes endpoint returns the names directly.
export function getScopes(): Promise<string[]> {
  return request("/scopes");
}

// Wrap a bare-array endpoint into a CursorPage so it can drive the cursor-paginated hooks. A page that
// fills the limit may have more behind it; the next cursor is the last (boundary) row's sort key.
function toCursorPage<T>(items: T[], limit: number, cursorOf: (last: T) => number): CursorPage<T> {
  const hasMore = items.length === limit;
  return { items, nextCursor: hasMore ? cursorOf(items[items.length - 1]!) : null, hasMore };
}

// Known routes. /routes returns a bare array ordered last_seen DESC; its cursor pages by last_seen (ms),
// so the last row carries the page's smallest last_seen — the cursor for the next (older) batch. We wrap
// it into a CursorPage here so RouteTable can stream pages via useInfinitePages. `iata` is a single code
// ("" = all), unlike the comma-separated `iatas` used elsewhere.
export async function getKnownRoutesPage(
  params?: { iata?: string; hopCount?: number; cursor?: number; limit?: number },
): Promise<CursorPage<KnownRoute>> {
  const limit = params?.limit ?? DEFAULT_PAGE_SIZE;
  const items = await request<KnownRoute[]>("/routes", {
    iata: params?.iata,
    hopCount: params?.hopCount,
    cursor: params?.cursor,
    limit,
  });
  return toCursorPage(items, limit, (r) => r.lastSeen);
}

// Search known routes for a path between two node hash prefixes within a single IATA. All three params
// are required by the server.
export function searchKnownRoutes(iata: string, from: string, to: string): Promise<KnownRoute[]> {
  return request("/routes/search", { iata, from, to });
}

// Trace tags. /traces returns a bare array of per-tag summaries (ordered newest-heard first, cursor is
// the last item's lastHeardAt); /traces/{tag} returns the tag's packets with resolved routes.
export function getTraces(
  iatas: string[] | undefined,
  params?: { scope?: string; since?: number; until?: number; cursor?: number; limit?: number },
): Promise<TraceTagSummary[]> {
  return request("/traces", {
    iatas: iatasParam(iatas),
    scope: params?.scope,
    since: params?.since,
    until: params?.until,
    cursor: params?.cursor,
    limit: params?.limit,
  });
}

export function getTraceDetail(tag: string): Promise<TraceDetail> {
  return request(`/traces/${tag}`);
}

export function getObserver(observerId: string): Promise<Observer> {
  return request(`/observers/${observerId}`);
}

// Paginated /nodes: returns the full cursor page so the caller can chain pages (cursor = the last
// node's lastSeen). Used by the map (iatas only) and the Nodes table (with its server-side filters).
export function getNodesPage(
  iatas: string[] | undefined,
  params?: {
    cursor?: number;
    limit?: number;
    type?: string;
    name?: string;
    supportsMultibytePaths?: "true" | "false";
    supportsMultibyteTraces?: "true" | "false";
  },
): Promise<CursorPage<NodeSummary>> {
  return request("/nodes", {
    iatas: iatasParam(iatas),
    cursor: params?.cursor,
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
    typeName: params?.type,
    name: params?.name,
    supportsMultibytePaths: params?.supportsMultibytePaths,
    supportsMultibyteTraces: params?.supportsMultibyteTraces,
  });
}

// Paginated /observers, mirroring getNodesPage; used by the Observers table.
export function getObserversPage(
  iatas: string[] | undefined,
  params?: { cursor?: number; limit?: number; type?: string; broker?: string; status?: string; name?: string },
): Promise<CursorPage<ObserverSummary>> {
  return request("/observers", {
    iatas: iatasParam(iatas),
    cursor: params?.cursor,
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
    type: params?.type,
    broker: params?.broker,
    status: params?.status,
    name: params?.name,
  });
}

export function getNode(nodeId: string): Promise<Node> {
  return request(`/nodes/${nodeId}`);
}

export function getNodeObservations(
  nodeId: string,
  params?: { cursor?: number; limit?: number },
): Promise<CursorPage<NodeObservation>> {
  return request(`/nodes/${nodeId}/observations`, {
    cursor: params?.cursor,
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
  });
}

export { ApiError };
