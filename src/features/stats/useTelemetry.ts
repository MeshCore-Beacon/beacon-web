import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getObserver, getObserverTelemetry } from "../../api/client";
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
