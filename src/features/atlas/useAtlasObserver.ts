import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getObserver, getObserverActivity, getObserverTelemetry, isNotFound } from "../../api/client";
import { queryRetryDelay } from "../../api/rate-limit";
import { useRateLimit } from "../../hooks/useRateLimit";
import { useTick } from "../../hooks/useTick";
import type { AtlasRange } from "./atlas";
import { OBSERVER_INTERVAL, OBSERVER_RANGE, summarizeObserver } from "./observer-sample";
import { ATLAS_REFRESH_MS } from "./useAtlas";

// A 404 means this server has no such endpoint; nothing to poll for.
const pollUnlessMissing = (error: unknown) => (isNotFound(error) ? false : ATLAS_REFRESH_MS);

// The observer record loads whenever the card is active; the series only while the Observer view is open.
export function useAtlasObserver(observerId: string | null, range: AtlasRange, active: boolean, open: boolean) {
  const now = useTick(ATLAS_REFRESH_MS);
  const limitedUntil = useRateLimit();
  const throttled = limitedUntil !== null && now < limitedUntil;
  const base = {
    staleTime: ATLAS_REFRESH_MS,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    retryDelay: queryRetryDelay,
  };
  const observer = useQuery({
    ...base,
    queryKey: ["atlas-observer", observerId],
    queryFn: ({ signal }) => getObserver(observerId!, signal),
    enabled: active && !throttled && observerId !== null,
    refetchInterval: ATLAS_REFRESH_MS,
  });
  const series = active && !throttled && open && observerId !== null;
  const activity = useQuery({
    ...base,
    queryKey: ["atlas-observer-activity", observerId, range],
    queryFn: ({ signal }) => getObserverActivity(observerId!, OBSERVER_RANGE[range], OBSERVER_INTERVAL, undefined, signal),
    enabled: series,
    refetchInterval: (query) => pollUnlessMissing(query.state.error),
  });
  const telemetry = useQuery({
    ...base,
    queryKey: ["atlas-observer-telemetry", observerId, range],
    queryFn: ({ signal }) => getObserverTelemetry(observerId!, OBSERVER_RANGE[range], OBSERVER_INTERVAL, undefined, signal),
    enabled: series,
    refetchInterval: (query) => pollUnlessMissing(query.state.error),
  });
  const sample = useMemo(
    () => summarizeObserver(activity.data, telemetry.data, observer.data, range, now),
    [activity.data, telemetry.data, observer.data, range, now],
  );
  return {
    observer,
    sample,
    loading: open && (activity.isLoading || telemetry.isLoading),
    unsupported: isNotFound(activity.error) || isNotFound(telemetry.error),
    failed: (activity.isError && !isNotFound(activity.error)) || (telemetry.isError && !isNotFound(telemetry.error)),
  };
}
