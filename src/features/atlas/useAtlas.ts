import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryRetryDelay } from "../../api/rate-limit";
import { useRateLimit } from "../../hooks/useRateLimit";
import { useTick } from "../../hooks/useTick";
import { loadAtlasNode, summarizeReports, type NodePin, type AtlasRange } from "./atlas";

export const ATLAS_REFRESH_MS = 60_000;

// A null pin (an observer-only card) leaves the query disabled.
export function useAtlasNode(pin: NodePin | null, range: AtlasRange, active: boolean) {
  const now = useTick(ATLAS_REFRESH_MS);
  const limitedUntil = useRateLimit();
  // Disabling the query drops its timer, so a poll can't fire inside the throttle window.
  const throttled = limitedUntil !== null && now < limitedUntil;
  const query = useQuery({
    queryKey: ["atlas-node", pin?.publicKey ?? null],
    queryFn: ({ signal }) => loadAtlasNode(pin!, signal),
    enabled: pin !== null && active && !throttled,
    staleTime: ATLAS_REFRESH_MS,
    refetchOnWindowFocus: false,
    refetchInterval: ATLAS_REFRESH_MS,
    refetchIntervalInBackground: false,
    retryDelay: queryRetryDelay,
  });
  const items = query.data?.page.items;
  const hasMore = query.data?.page.hasMore ?? false;
  const sample = useMemo(() => summarizeReports(items ?? [], range, now, hasMore), [items, range, now, hasMore]);
  return { query, node: query.data?.node, sample, capped: sample.truncated };
}
