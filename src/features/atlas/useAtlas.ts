import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isNotFound } from "../../api/client";
import { useRateLimit } from "../../hooks/useRateLimit";
import { useTick } from "../../hooks/useTick";
import { loadAtlasNode, summarizeReports, type NodePin, type AtlasRange } from "./atlas";

export const ATLAS_REFRESH_MS = 60_000;
// A pin whose radio is gone is checked rarely, so it can come back after a reset without costing a poll a minute.
export const ATLAS_MISSING_REFRESH_MS = 600_000;
export const pollUnlessGone = (error: unknown) => (isNotFound(error) ? ATLAS_MISSING_REFRESH_MS : ATLAS_REFRESH_MS);

// True while the API is throttling us. A timer marks the window over: the flag itself only clears on a
// successful request, and a paused Atlas makes none.
export function useThrottled() {
  const until = useRateLimit();
  const [ended, setEnded] = useState<number | null>(null);
  useEffect(() => {
    if (until === null) return;
    const id = setTimeout(() => setEnded(until), Math.max(0, until - Date.now()));
    return () => clearTimeout(id);
  }, [until]);
  return until !== null && ended !== until;
}

// A null pin (an observer-only card) leaves the query disabled.
export function useAtlasNode(pin: NodePin | null, range: AtlasRange, active: boolean) {
  const now = useTick(ATLAS_REFRESH_MS);
  // Disabling the query drops its timer, so a poll can't fire inside the throttle window.
  const throttled = useThrottled();
  const query = useQuery({
    queryKey: ["atlas-node", pin?.publicKey ?? null],
    queryFn: ({ signal }) => loadAtlasNode(pin!, signal),
    enabled: pin !== null && active && !throttled,
    staleTime: ATLAS_REFRESH_MS,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => pollUnlessGone(query.state.error),
    refetchIntervalInBackground: false,
  });
  const items = query.data?.page.items;
  const hasMore = query.data?.page.hasMore ?? false;
  const sample = useMemo(() => summarizeReports(items ?? [], range, now, hasMore), [items, range, now, hasMore]);
  return { query, node: query.data?.node, sample, capped: sample.truncated };
}
