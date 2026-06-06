import { API_BASE, DEFAULT_PAGE_SIZE } from "../lib/constants";
import type { CursorPage, PacketSummary, PacketDetail, IataCode, RegionSummary, Region, BrokerStatus, ScopeStats } from "../types/api";
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

export async function getChannelMessages(
  channelId: number,
  params?: { iatas?: string[]; limit?: number },
): Promise<ChannelMessage[]> {
  const page = await request<{ items: ChannelMessage[] }>(`/channels/${channelId}/messages`, {
    iatas: iatasParam(params?.iatas),
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
  });
  return page.items;
}

export function getBrokers(): Promise<BrokerStatus[]> {
  return request("/brokers");
}

export function getScopeStats(): Promise<ScopeStats[]> {
  return request("/stats/scopes");
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
