import { useQuery } from "@tanstack/react-query";
import type { StatsRegion } from "../../api/client";
import { gatedOn, useStatsRegion } from "./useStats";
import { RANGE_MS, type StatsRange } from "./types";

// Shared minute boundaries let viewers reuse server aggregates without changing the key every render.
const minuteFloor = () => Math.floor(Date.now() / 60_000) * 60_000;

// Shared by usePathStats/useSignalStats (and any future /stats/* window query): resolves the
// region, floors the window to minute boundaries and polls every minute.
export function useWindowedStats<T>(
  key: string,
  range: StatsRange,
  fetch: (since: number, until: number, where: StatsRegion, signal?: AbortSignal) => Promise<T>,
) {
  const { where, regionKey, isResolved } = useStatsRegion();
  return useQuery({
    queryKey: [key, regionKey, range],
    ...gatedOn(isResolved, (signal) => {
      const until = minuteFloor();
      return fetch(until - RANGE_MS[range], until, where, signal);
    }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}
