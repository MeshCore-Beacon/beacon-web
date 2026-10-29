import { queryOptions, useQuery } from "@tanstack/react-query";
import type { StatsRegion } from "../../api/client";
import { gatedOn, useStatsRegion, type StatsScope } from "./useStats";
import { RANGE_MS, type StatsRange } from "./types";

// Shared minute boundaries let viewers reuse server aggregates without changing the key every render.
const minuteFloor = () => Math.floor(Date.now() / 60_000) * 60_000;

// Shared by the path and signal stats (and any future /stats/* window query): floors the window to
// minute boundaries and polls every minute.
export function windowedStatsQuery<T>(
  key: string,
  s: StatsScope,
  range: StatsRange,
  fetch: (since: number, until: number, where: StatsRegion, signal?: AbortSignal) => Promise<T>,
) {
  return queryOptions({
    queryKey: [key, s.regionKey, range],
    ...gatedOn(s.isResolved, (signal) => {
      const until = minuteFloor();
      return fetch(until - RANGE_MS[range], until, s.where, signal);
    }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useWindowedStats<T>(
  key: string,
  range: StatsRange,
  fetch: (since: number, until: number, where: StatsRegion, signal?: AbortSignal) => Promise<T>,
) {
  return useQuery(windowedStatsQuery(key, useStatsRegion(), range, fetch));
}
