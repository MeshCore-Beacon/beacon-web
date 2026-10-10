import { API_BASE, DEFAULT_PAGE_SIZE } from "../lib/constants";
import { noteRateLimited, noteRequestOk, parseRetryAfter } from "./rate-limit";
import type { CursorPage, PacketSummary, PacketDetail, IataCode, RegionSummary, Region, BrokerStatus, RouteEvidence, KnownRoute, CrossIATARoute, TraceTagSummary, TraceType, TraceDetail } from "../types/api";
import type { ChannelPage, ChannelMessage } from "../features/channels/types";
import type { ObserverSummary, Observer, AdvertObservation, ObserverDirectoryPage, ObserverDirectorySort } from "../features/observers/types";
import type { NodeSummary, Node, NodeObservation, NodeNeighbor } from "../features/nodes/types";
import type {
  StatsSeries,
  SignalStats,
  PathStats,
  ObserverComparison,
  ObservationPoint,
  PayloadBreakdownItem,
  TopNode,
  TopObserver,
  AdvertiserSort,
  TopAdvertiser,
  TopTalker,
  RadioPreset,
  ScopeStats,
  ObserverTelemetry,
  ObserverActivity,
  NodeTypeCount,
  ClockDriftEntry,
} from "../features/stats/types";
import type { Feature, Polygon, MultiPolygon } from "geojson";

export type IataBorder = Feature<Polygon | MultiPolygon>;

// typed fetch wrapper with query params

class ApiError extends Error {
  status: number;
  code: string;
  retryAfterMs?: number;

  constructor(status: number, code: string, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

// Builds the error for a non-ok response; a 429 also flips the app-wide rate-limited flag.
async function errorFrom(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({ error: { code: "unknown", message: res.statusText } }));
  const retryAfterMs = parseRetryAfter(res.headers.get("Retry-After"));
  if (res.status === 429) noteRateLimited(retryAfterMs);
  return new ApiError(res.status, body.error?.code ?? "unknown", body.error?.message ?? res.statusText, retryAfterMs);
}

async function request<T>(path: string, params?: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const res = await (signal ? fetch(url.toString(), { signal }) : fetch(url.toString()));

  if (!res.ok) throw await errorFrom(res);
  noteRequestOk();

  return res.json();
}

// endpoint functions

export function getObserverComparison(
  iatas: StatsRegion,
  params: { observerA: string; observerB: string; since: number; until: number },
  signal?: AbortSignal,
): Promise<ObserverComparison> {
  return request("/stats/observer-comparison", { ...params, ...statsRegionParams(iatas) }, signal);
}

// The region filter travels as the comma-separated `iatas` param; undefined/empty means all regions.
function iatasParam(iatas?: string[]): string | undefined {
  return iatas && iatas.length > 0 ? iatas.join(",") : undefined;
}

// An empty list is a region with no IATAs. These endpoints would answer it with every IATA, so skip them.
const noIatas = (iatas?: string[]) => iatas?.length === 0;
const emptyPage = <T>(): CursorPage<T> => ({ items: [], nextCursor: null, hasMore: false });

// Stats endpoints also take a region slug, which the server answers with zeros when it has no IATAs.
export type StatsRegion = string[] | { region: string } | undefined;

function statsRegionParams(r: StatsRegion): { iatas?: string; region?: string } {
  return Array.isArray(r) || r === undefined ? { iatas: iatasParam(r) } : { region: r.region };
}

export function getPackets(
  iatas: string[] | undefined,
  params?: { cursor?: number; limit?: number; payloadTypes?: number[]; routeTypes?: number[]; scopes?: string[] },
): Promise<CursorPage<PacketSummary>> {
  if (noIatas(iatas)) return Promise.resolve(emptyPage());
  return request("/packets", {
    iatas: iatasParam(iatas),
    cursor: params?.cursor,
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
    payloadTypes: params?.payloadTypes?.length ? params.payloadTypes.join(",") : undefined,
    routeTypes: params?.routeTypes?.length ? params.routeTypes.join(",") : undefined,
    scopes: params?.scopes?.length ? params.scopes.join(",") : undefined,
  });
}

export function getPacketDetail(packetHash: string): Promise<PacketDetail> {
  return request(`/packets/${packetHash}`);
}

// /info: the oldest client versions this server accepts (null = no requirement) and its own version.
export interface ServerInfo {
  minAppVersion: string | null;
  minWebVersion: string | null;
  serverVersion: string;
}

export function getServerInfo(): Promise<ServerInfo> {
  return request("/info");
}

export function getIatas(): Promise<IataCode[]> {
  return request("/iatas");
}

// An IATA's GeoJSON border, or null when none is configured. Can't use request(): the endpoint
// answers 204 (empty body) or a literal `null` for "no border", and request() always parses JSON.
export async function getIataBorder(iata: string): Promise<IataBorder | null> {
  const url = new URL(`${API_BASE}/iatas/${iata}/border`, window.location.origin);
  const res = await fetch(url.toString());
  if (!res.ok) throw await errorFrom(res);
  noteRequestOk();
  if (res.status === 204) return null;
  const body = await res.json();
  return (body ?? null) as IataBorder | null;
}

export function getRegions(): Promise<RegionSummary[]> {
  return request("/regions");
}

export function getRegion(regionId: number): Promise<Region> {
  return request(`/regions/${regionId}`);
}

// Preserve the server cursor rather than deriving it from the displayed channel order.
export function getChannels(params?: { iatas?: string[]; limit?: number; cursor?: number | string; keyKnown?: boolean }): Promise<ChannelPage> {
  if (noIatas(params?.iatas)) return Promise.resolve(emptyPage());
  const iatas = params?.iatas ?? [];
  return request("/channels", {
    iata: iatas.length === 1 ? iatas[0] : undefined,
    iatas: iatas.length > 1 ? iatasParam(iatas) : undefined,
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
    cursor: typeof params?.cursor === "number" ? params.cursor : undefined,
    pageCursor: typeof params?.cursor === "string" ? params.cursor : undefined,
    keyKnown: params?.keyKnown === undefined ? undefined : String(params.keyKnown),
  });
}

// Channel messages come back as { items } ordered id DESC, so the last row is the page's oldest
// (smallest) id — the cursor for the next, older batch (the backend pages by id < cursor). Wrapped into
// a CursorPage so MessagePanel can load older history on demand via useInfiniteQuery.
export async function getChannelMessagesPage(
  channelId: number,
  params?: { iatas?: string[]; cursor?: number; limit?: number; scope?: string },
): Promise<CursorPage<ChannelMessage>> {
  if (noIatas(params?.iatas)) return emptyPage();
  const limit = params?.limit ?? DEFAULT_PAGE_SIZE;
  const page = await request<{ items: ChannelMessage[]; nextCursor?: number | null; hasMore?: boolean }>(`/channels/${channelId}/messages`, {
    iatas: iatasParam(params?.iatas),
    cursor: params?.cursor,
    limit,
    scope: params?.scope || undefined,
  });
  if (typeof page.hasMore === "boolean") return { items: page.items, nextCursor: page.nextCursor ?? null, hasMore: page.hasMore };
  return toCursorPage(page.items, limit, (m) => m.id);
}

export function getBrokers(): Promise<BrokerStatus[]> {
  return request("/brokers");
}

// Transport scope names (e.g. "#bc", "#west") for the scope filter dropdowns. With IATAs the server
// returns only that region's scopes (manual config + its MeshMapper catalogue); bare, every stored name.
export function getScopes(iatas?: string[]): Promise<string[]> {
  if (noIatas(iatas)) return Promise.resolve([]);
  return request("/scopes", { iatas: iatasParam(iatas) });
}

// Wrap a bare-array endpoint into a CursorPage so it can drive the cursor-paginated hooks. A page that
// fills the limit may have more behind it; the next cursor is the last (boundary) row's sort key.
function toCursorPage<T, C = number>(items: T[], limit: number, cursorOf: (last: T) => C): CursorPage<T, C> {
  const hasMore = items.length === limit;
  return { items, nextCursor: hasMore ? cursorOf(items[items.length - 1]!) : null, hasMore };
}

// Known routes. /routes returns a bare array ordered last_seen DESC, id DESC; the next (older) batch
// starts after the last row's lastSeen (ms), with its id breaking ties inside that millisecond. We wrap
// it into a CursorPage here so RouteTable can stream pages via useInfinitePages. `iata` is a single code
// ("" = all), unlike the comma-separated `iatas` used elsewhere.
export interface RouteCursor {
  lastSeen: number;
  id: number;
}

export async function getKnownRoutesPage(
  params?: { iata?: string; hopCount?: number; cursor?: RouteCursor; limit?: number },
): Promise<CursorPage<KnownRoute, RouteCursor>> {
  const limit = params?.limit ?? DEFAULT_PAGE_SIZE;
  const items = await request<KnownRoute[]>("/routes", {
    iata: params?.iata,
    hopCount: params?.hopCount,
    cursor: params?.cursor?.lastSeen,
    cursorId: params?.cursor?.id,
    limit,
  });
  return toCursorPage(items, limit, (r) => ({ lastSeen: r.lastSeen, id: r.id }));
}

export function getRouteEvidence(iata: string, pathKey: string, params: { range?: string; since?: number; until?: number; pageCursor?: string; limit?: number }, signal?: AbortSignal): Promise<RouteEvidence> {
  return request(`/routes/${encodeURIComponent(iata)}/${encodeURIComponent(pathKey)}/observations`, params, signal);
}

// Route search between two node hash prefixes. iatas narrows the search; omitted means every IATA.
// /routes/search returns routes within one IATA, /routes/cross routes that cross between two.
const iataList = (iatas: string[] | undefined) => (iatas?.length ? iatas.join(",") : undefined);

export function searchKnownRoutes(iatas: string[] | undefined, from: string, to: string, signal?: AbortSignal): Promise<KnownRoute[]> {
  return request("/routes/search", { iatas: iataList(iatas), from, to }, signal);
}

export function searchCrossIATARoutes(
  iatas: string[] | undefined,
  fromHash: string,
  toHash: string,
  signal?: AbortSignal,
): Promise<CrossIATARoute[]> {
  return request("/routes/cross", { iatas: iataList(iatas), fromHash, toHash }, signal);
}

// Trace tags. /traces returns a bare array of per-tag summaries (ordered newest-heard first, cursor is
// the last item's lastHeardAt); /traces/{tag} returns the tag's packets with resolved routes.
export function getTraces(
  iatas: string[] | undefined,
  params?: { scope?: string; type?: TraceType; since?: number; until?: number; cursor?: number; limit?: number },
): Promise<TraceTagSummary[]> {
  if (noIatas(iatas)) return Promise.resolve([]);
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

export async function getObserver(observerId: string): Promise<Observer> {
  const observer = await request<Observer>(`/observers/${observerId}`);
  // Servers before json.RawMessage (and cache entries written by them) send the stored JSON as base64.
  let metadata: unknown = observer.statusMetadata;
  if (typeof metadata === "string") {
    try { metadata = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(metadata), c => c.charCodeAt(0)))); }
    catch { metadata = undefined; }
  }
  return { ...observer, statusMetadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : undefined };
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
    pubkeyPrefix?: string; // case-insensitive hex prefix; server matches and validates
    supportsMultibytePaths?: "true" | "false";
    supportsMultibyteTraces?: "true" | "false";
    neighbors?: boolean; // include each node's neighborIds (?neighbors=true)
  },
): Promise<CursorPage<NodeSummary>> {
  if (noIatas(iatas)) return Promise.resolve(emptyPage());
  return request("/nodes", {
    iatas: iatasParam(iatas),
    cursor: params?.cursor,
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
    typeName: params?.type,
    name: params?.name,
    pubkeyPrefix: params?.pubkeyPrefix,
    supportsMultibytePaths: params?.supportsMultibytePaths,
    supportsMultibyteTraces: params?.supportsMultibyteTraces,
    neighbors: params?.neighbors ? "true" : undefined,
  });
}

export interface ObserverDirectoryRequest {
  location?: StatsRegion;
  sort?: ObserverDirectorySort;
  since?: number;
  until?: number;
  cursor?: number;
  limit?: number;
  name?: string;
  type?: string;
  broker?: string;
  status?: string;
  scope?: string;
}

export async function getObserverDirectoryPage(params: ObserverDirectoryRequest, signal?: AbortSignal): Promise<ObserverDirectoryPage> {
  const { location, ...filters } = params;
  const page = await request<ObserverDirectoryPage>("/observers/directory", { ...statsRegionParams(location), ...filters }, signal);
  // A legacy detail response must never be mistaken for a paginated directory.
  const isCount = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
  if (!page || !Array.isArray(page.items) || !Array.isArray(page.observerTypes) || typeof page.hasMore !== "boolean" ||
      !Number.isFinite(page.windowStart) || !Number.isFinite(page.windowEnd) || page.windowStart >= page.windowEnd ||
      !["traffic", "name"].includes(page.effectiveSort) ||
      !["complete", "partial", "unavailable"].includes(page.coverage?.status) || !isCount(page.maxObservationCount) ||
      page.items.some(row => !row || typeof row.id !== "string" || !isCount(row.observationCount))) {
    throw new Error("Invalid observer directory response");
  }
  return page;
}

export async function supportsObserverDirectory(signal?: AbortSignal): Promise<boolean> {
  try {
    await getObserverDirectoryPage({ limit: 1 }, signal);
    return true;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 ||
        (error.status === 400 && error.message === "failed to parse observer UUID"))) return false;
    throw error;
  }
}

// Paginated /observers, mirroring getNodesPage; used by the Observers table.
export function getObserversPage(
  iatas: string[] | undefined,
  params?: { cursor?: number; limit?: number; type?: string; broker?: string; status?: string; name?: string },
): Promise<CursorPage<ObserverSummary>> {
  if (noIatas(iatas)) return Promise.resolve(emptyPage());
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

export function getStatsSeries(since: number, until: number, iatas?: StatsRegion, signal?: AbortSignal): Promise<StatsSeries> {
  return request("/stats/series", { since, until, ...statsRegionParams(iatas) }, signal);
}

export function getStatsObservations(iatas?: StatsRegion, since?: number, signal?: AbortSignal): Promise<ObservationPoint[]> {
  return request("/stats/observations", { ...statsRegionParams(iatas), since }, signal);
}

export function getSignalStats(since: number, until: number, iatas?: StatsRegion, signal?: AbortSignal): Promise<SignalStats> {
  return request("/stats/signal", { since, until, ...statsRegionParams(iatas) }, signal);
}

export function getPathStats(since: number, until: number, iatas?: StatsRegion, signal?: AbortSignal): Promise<PathStats> {
  return request("/stats/paths", { since, until, ...statsRegionParams(iatas) }, signal);
}

export function getPayloadBreakdown(iatas?: StatsRegion, since?: number): Promise<PayloadBreakdownItem[]> {
  return request("/stats/payload-breakdown", { ...statsRegionParams(iatas), since });
}

export function getTopNodes(iatas?: StatsRegion, since?: number, limit = 10): Promise<TopNode[]> {
  return request("/stats/top-nodes", { ...statsRegionParams(iatas), since, limit });
}

export function getTopObservers(iatas?: StatsRegion, since?: number, limit = 10): Promise<TopObserver[]> {
  return request("/stats/top-observers", { ...statsRegionParams(iatas), since, limit });
}

export function getTopAdvertisers(iatas: StatsRegion | undefined, since: number | undefined, sort: AdvertiserSort, limit = 10): Promise<TopAdvertiser[]> {
  return request("/stats/top-advertisers", { ...statsRegionParams(iatas), since, sort, limit });
}

export function getTopTalkers(iatas?: StatsRegion, since?: number, limit = 10): Promise<TopTalker[]> {
  return request("/stats/top-talkers", { ...statsRegionParams(iatas), since, limit });
}

export function getRadioPresets(iatas?: StatsRegion): Promise<RadioPreset[]> {
  return request("/stats/radio-presets", { ...statsRegionParams(iatas) });
}

export function getStatsNodeTypes(iatas?: StatsRegion): Promise<NodeTypeCount[]> {
  return request("/stats/node-types", { ...statsRegionParams(iatas) });
}

// Repeaters/room servers whose clock has drifted past the server threshold, worst-first. Not
// time-windowed and top-N only (no cursor), so callers pass a generous limit and page client-side.
export function getClockDrift(iatas?: StatsRegion, limit = 100): Promise<ClockDriftEntry[]> {
  return request("/stats/clock-drift", { ...statsRegionParams(iatas), limit });
}

// renamed from getScopes to avoid colliding with the /scopes name list; this is the /stats/scopes
// aggregate (packet/observer/node counts), filtered by the selected IATAs.
export function getStatsScopes(iatas?: StatsRegion, since?: number, signal?: AbortSignal): Promise<ScopeStats[]> {
  return request("/stats/scopes", { ...statsRegionParams(iatas), since }, signal);
}

export function getObserverTelemetry(
  observerId: string,
  range: string,
  interval?: string,
  afterId?: number,
): Promise<ObserverTelemetry> {
  return request(`/observers/${observerId}/telemetry`, { range, interval, afterId });
}

export function getObserverActivity(observerId: string, range: string, interval: string, until?: number): Promise<ObserverActivity> {
  return request(`/observers/${observerId}/activity`, { range, interval, until });
}

// Lets a caller hide a feature the server doesn't have rather than show it as failed.
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export { ApiError };
