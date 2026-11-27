import { useQuery } from "@tanstack/react-query";
import { getNodePoller, getNodePolling, getNodeTelemetry, isNotFound } from "../../api/client";

import type { NodeTelemetry, NodeTelemetryRange } from "./types";

export type { NodeTelemetryRange };

// Polling and poller: a 404 is cached as null and `select` hands callers undefined.
async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}
const toUndefined = <T,>(data: T | null): T | undefined => data ?? undefined;

// A 404 means this server has no such route. It is cached as an explicit result because a query
// function may not return undefined.
export type NodeTelemetryResult = { unsupported: true } | { unsupported: false; telemetry: NodeTelemetry };

async function loadTelemetry(id: string, range: NodeTelemetryRange, signal: AbortSignal, interval?: string): Promise<NodeTelemetryResult> {
  try {
    return { unsupported: false, telemetry: await (interval ? getNodeTelemetry(id, range, signal, interval) : getNodeTelemetry(id, range, signal)) };
  } catch (err) {
    if (isNotFound(err)) return { unsupported: true };
    throw err;
  }
}

// `refetchMs` is for a caller that keeps the reading on screen, such as an Atlas card. It stops
// once the server has said it has no such route. `interval` overrides the range's default bucket and
// gets its own cache entry.
export function useNodeTelemetry(id: string | undefined, range: NodeTelemetryRange, enabled: boolean, refetchMs?: number, interval?: string) {
  const query = useQuery({
    queryKey: interval ? ["node-telemetry", id, range, interval] : ["node-telemetry", id, range],
    queryFn: ({ signal }) => loadTelemetry(id!, range, signal, interval),
    enabled: enabled && !!id,
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data?.unsupported ? false : (refetchMs ?? false)),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const result = query.data;
  return {
    ...query,
    data: result && !result.unsupported ? result.telemetry : undefined,
    unsupported: result?.unsupported === true,
  };
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

// `refetchMs` as in useNodeTelemetry; it stops once the server has said it has no such route.
export function useNodePoller(id: string | undefined, enabled: boolean, refetchMs?: number) {
  return useQuery({
    queryKey: ["node-poller", id],
    queryFn: ({ signal }) => orNull(() => getNodePoller(id!, signal)),
    enabled: enabled && !!id,
    select: toUndefined,
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data === null ? false : (refetchMs ?? false)),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}
