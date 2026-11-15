import { useQuery } from "@tanstack/react-query";
import { getNodePolling, getNodeTelemetry, isNotFound } from "../../api/client";

export type NodeTelemetryRange = "24h" | "168h" | "720h";

// A 404 means this server has no such route. A query can't hold undefined, so cache null and
// let `select` hand callers undefined, which they read as "not supported".
async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}
const toUndefined = <T,>(data: T | null): T | undefined => data ?? undefined;

// `refetchMs` is for a caller that keeps the reading on screen, such as an Atlas card.
export function useNodeTelemetry(id: string | undefined, range: NodeTelemetryRange, enabled: boolean, refetchMs?: number) {
  return useQuery({
    queryKey: ["node-telemetry", id, range],
    queryFn: ({ signal }) => orNull(() => getNodeTelemetry(id!, range, signal)),
    enabled: enabled && !!id,
    select: toUndefined,
    staleTime: 60_000,
    refetchInterval: refetchMs,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}

export function useNodePolling(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["node-polling", id],
    queryFn: ({ signal }) => orNull(() => getNodePolling(id!, signal)),
    enabled: enabled && !!id,
    select: toUndefined,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
