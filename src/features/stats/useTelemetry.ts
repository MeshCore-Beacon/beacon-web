import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getObserver, getObserverTelemetry, getObserverActivity, isNotFound } from "../../api/client";
import type { StatsRange } from "./types";

// Go time.ParseDuration strings the telemetry endpoint expects, per selected range.
const RANGE_PARAM: Record<StatsRange, string> = {
  "24h": "24h",
  "7d": "168h",
  "30d": "720h",
};

// Bucketing interval per range: raw 1h points at 24h, coarser buckets for the longer windows so the
// charts don't drown in points.
const INTERVAL_PARAM: Record<StatsRange, string> = {
  "24h": "1h",
  "7d": "6h",
  "30d": "24h",
};

export function useObserver(observerId: string | null) {
  return useQuery({
    queryKey: ["observer", observerId],
    queryFn: () => getObserver(observerId!),
    enabled: !!observerId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// Bucket per range: a quiet hour stays visible at 24h, the longer windows stay under ~200 points.
const ACTIVITY_INTERVAL: Record<StatsRange, string> = {
  "24h": "15m",
  "7d": "1h",
  "30d": "6h",
};

export function activityParamsFor(range: StatsRange): { range: string; interval: string } {
  return { range: RANGE_PARAM[range], interval: ACTIVITY_INTERVAL[range] };
}

// Heard activity moves with packets, so poll; stop once a 404 says this server has no endpoint.
export function activityRefetchInterval(error: unknown): number | false {
  return isNotFound(error) ? false : 60_000;
}

export function useObserverActivity(observerId: string | null, range: StatsRange) {
  const params = activityParamsFor(range);
  return useQuery({
    queryKey: ["observer-activity", observerId, range],
    queryFn: () => getObserverActivity(observerId!, params.range, params.interval),
    enabled: !!observerId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => activityRefetchInterval(query.state.error),
  });
}

export function useObserverTelemetry(observerId: string | null, range: StatsRange) {
  const interval = INTERVAL_PARAM[range];
  return useQuery({
    queryKey: ["observer-telemetry", observerId, range, interval],
    queryFn: () => getObserverTelemetry(observerId!, RANGE_PARAM[range], interval),
    enabled: !!observerId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}
