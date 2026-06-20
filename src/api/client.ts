import { API_BASE, DEFAULT_PAGE_SIZE } from "../lib/constants";
import type { CursorPage, PacketSummary, PacketDetail, IataCode, RegionSummary, Region, BrokerStatus, KnownRoute, CrossIATARoute, TraceTagSummary, TraceType, TraceDetail } from "../types/api";
import type { ChannelSummary, ChannelMessage } from "../features/channels/types";
import type { ObserverSummary, Observer, AdvertObservation } from "../features/observers/types";
import type { NodeSummary, Node, NodeObservation, NodeNeighbor } from "../features/nodes/types";
import type {
  StatsOverview,
  ObservationPoint,
  PayloadBreakdownItem,
  TopNode,
  TopObserver,
  RadioPreset,
  ScopeStats,
  ObserverTelemetry,
  NodeTypeCount,
} from "../features/stats/types";

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
  params?: { cursor?: number; limit?: number },
): Promise<CursorPage<PacketSummary>> {
  return request("/packets", {
    iatas: iatasParam(iatas),
    cursor: params?.cursor,
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
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

// /channels only honors a singular `iata`, so a one-IATA region goes through it; multi-IATA regions
// still send `iatas` (ignored server-side, effectively global) until the backend supports it.
export async function getChannels(params?: { iatas?: string[]; limit?: number }): Promise<ChannelSummary[]> {
  const iatas = params?.iatas ?? [];
  const page = await request<{ items: ChannelSummary[] }>("/channels", {
    iata: iatas.length === 1 ? iatas[0] : undefined,
    iatas: iatas.length > 1 ? iatasParam(iatas) : undefined,
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

// Search routes that cross IATA boundaries, from a hash in one IATA to a hash in another. All four
// params are required by the server.
export function searchCrossIATARoutes(
  fromHash: string,
  fromIata: string,
  toHash: string,
  toIata: string,
): Promise<CrossIATARoute[]> {
  return request("/routes/cross", { fromHash, fromIata, toHash, toIata });
}

// Trace tags. /traces returns a bare array of per-tag summaries (ordered newest-heard first, cursor is
// the last item's lastHeardAt); /traces/{tag} returns the tag's packets with resolved routes.
export function getTraces(
  iatas: string[] | undefined,
  params?: { scope?: string; type?: TraceType; since?: number; until?: number; cursor?: number; limit?: number },
): Promise<TraceTagSummary[]> {
  return request("/traces", {
    iatas: iatasParam(iatas),
    scope: params?.scope,
    type: params?.type, // TRACE or PING; omitted = both (request() drops undefined params)
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

export function getObserverAdverts(
  observerId: string,
  params?: { cursor?: number; limit?: number },
): Promise<CursorPage<AdvertObservation>> {
  return request(`/observers/${observerId}/adverts`, {
    cursor: params?.cursor,
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
  });
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

export function getNodeNeighbors(nodeId: string): Promise<NodeNeighbor[]> {
  return request(`/nodes/${nodeId}/neighbors`);
}

// stats endpoints

export function getStatsOverview(iatas?: string[]): Promise<StatsOverview> {
  return request("/stats/overview", { iatas: iatasParam(iatas) });
}

export function getStatsObservations(iatas?: string[], since?: number): Promise<ObservationPoint[]> {
  return request("/stats/observations", { iatas: iatasParam(iatas), since });
}

export function getPayloadBreakdown(iatas?: string[], since?: number): Promise<PayloadBreakdownItem[]> {
  return request("/stats/payload-breakdown", { iatas: iatasParam(iatas), since });
}

export function getTopNodes(iatas?: string[], limit = 10): Promise<TopNode[]> {
  return request("/stats/top-nodes", { iatas: iatasParam(iatas), limit });
}

export function getTopObservers(iatas?: string[], since?: number, limit = 10): Promise<TopObserver[]> {
  return request("/stats/top-observers", { iatas: iatasParam(iatas), since, limit });
}

export function getRadioPresets(iatas?: string[]): Promise<RadioPreset[]> {
  return request("/stats/radio-presets", { iatas: iatasParam(iatas) });
}

export function getStatsNodeTypes(iatas?: string[]): Promise<NodeTypeCount[]> {
  return request("/stats/node-types", { iatas: iatasParam(iatas) });
}

// renamed from getScopes to avoid colliding with the /scopes name list; this is the /stats/scopes
// aggregate (packet/observer/node counts), reported globally regardless of the active region.
export function getStatsScopes(): Promise<ScopeStats[]> {
  return request("/stats/scopes");
}

export function getObserverTelemetry(
  observerId: string,
  range: string,
  interval?: string,
  afterId?: number,
): Promise<ObserverTelemetry> {
  return request(`/observers/${observerId}/telemetry`, { range, interval, afterId });
}

export { ApiError };
