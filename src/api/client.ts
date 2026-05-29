import { API_BASE, DEFAULT_PAGE_SIZE } from "../lib/constants";
import type { CursorPage, PacketSummary, PacketDetail, IataCode, BrokerStatus } from "../types/api";
import type { ChannelSummary, ChannelMessage } from "../features/channels/types";
import type { ObserverSummary, Observer } from "../features/observers/types";

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

export function getPackets(
  iata: string,
  params?: { cursor?: string; limit?: number; afterId?: number },
): Promise<CursorPage<PacketSummary>> {
  return request("/packets", {
    iata: iata === "*" ? undefined : iata,
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

export async function getChannels(params?: { iata?: string; limit?: number }): Promise<ChannelSummary[]> {
  const page = await request<{ items: ChannelSummary[] }>("/channels", {
    iata: params?.iata,
    limit: params?.limit,
  });
  return page.items;
}

export async function getChannelMessages(
  channelId: number,
  params?: { iata?: string; limit?: number },
): Promise<ChannelMessage[]> {
  const page = await request<{ items: ChannelMessage[] }>(`/channels/${channelId}/messages`, {
    iata: params?.iata,
    limit: params?.limit ?? DEFAULT_PAGE_SIZE,
  });
  return page.items;
}

export function getBrokers(): Promise<BrokerStatus[]> {
  return request("/brokers");
}

export function getObservers(
  params?: { iata?: string; type?: string; broker?: string; status?: string },
): Promise<ObserverSummary[]> {
  return request("/observers", {
    iata: params?.iata,
    type: params?.type,
    broker: params?.broker,
    status: params?.status,
  });
}

export function getObserver(observerId: string): Promise<Observer> {
  return request(`/observers/${observerId}`);
}

export { ApiError };
