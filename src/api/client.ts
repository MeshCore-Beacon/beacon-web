import { API_BASE, DEFAULT_PAGE_SIZE } from "../lib/constants";
import type { CursorPage, PacketSummary, PacketDetail, IataCode } from "../types/api";

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
  const url = new URL(`${API_BASE}${path}`);
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

export { ApiError };
