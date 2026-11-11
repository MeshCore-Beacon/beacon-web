import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getObserver, getObserverActivity, getObserverTelemetry, isNotFound } from "../../api/client";
import { useTick } from "../../hooks/useTick";
import type { AtlasRange } from "./atlas";
import { OBSERVER_INTERVAL, OBSERVER_RANGE, summarizeObserver } from "./observer-sample";
import { ATLAS_REFRESH_MS, pollUnlessGone, pollUnlessMissing, useThrottled } from "./useAtlas";

// The series load only while the Observer view is open. The record does too, unless the card needs it
// for its title (an observer pin).
export function useAtlasObserver(observerId: string | null, range: AtlasRange, active: boolean, open: boolean, needRecord = false) {
  const now = useTick(ATLAS_REFRESH_MS);
  const throttled = useThrottled();
  const base = {
    staleTime: ATLAS_REFRESH_MS,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
  };
  const observer = useQuery({
    ...base,
    queryKey: ["atlas-observer", observerId],
    queryFn: ({ signal }) => getObserver(observerId!, signal),
    enabled: active && !throttled && observerId !== null && (open || needRecord),
    refetchInterval: (query) => pollUnlessGone(query.state.error),
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
