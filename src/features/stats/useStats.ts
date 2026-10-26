import { useMemo } from "react";
import { useQuery, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { useRegion } from "../../hooks/useRegion";
import {
  getStatsSeries,
  getStatsObservations,
  getPayloadBreakdown,
  getTopNodes,
  getTopObservers,
  getTopAdvertisers,
  getTopTalkers,
  getRadioPresets,
  getStatsScopes,
  getStatsNodeTypes,
  getClockDrift,
  type StatsRegion,
} from "../../api/client";
import { RANGE_MS, type AdvertiserSort, type StatsRange } from "./types";

// Shared query options: cache for 30s; previous data stays as placeholder so tabs can decide whether to show it during a switch.
const common = {
  staleTime: 30_000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

// The resolved region a stats query is scoped to.
export interface StatsScope {
  where: StatsRegion;
  regionKey: string;
  isResolved?: boolean;
}

// A region with no member IATAs is sent by slug so the server returns zeros rather than every IATA.
export function useStatsRegion(): StatsScope {
  const { iatas, regionKey, isResolved, emptyRegion } = useRegion();
  return useMemo(() => {
    const where: StatsRegion = emptyRegion ? { region: emptyRegion } : iatas;
    return { where, regionKey, isResolved };
  }, [iatas, regionKey, isResolved, emptyRegion]);
}

// Holds a query until the selected region resolves; an unresolved slug would otherwise fetch every IATA.
export function gatedOn<T>(isResolved: boolean | undefined, fetch: (signal: AbortSignal) => Promise<T>) {
  return {
    enabled: isResolved !== false,
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      if (isResolved === false) throw new Error("Selected region is not available yet");
      return fetch(signal);
    },
  };
}

// `since` is computed inside queryFn so refetches use a fresh window without churning the query key.
export const sinceFor = (range: StatsRange) => Date.now() - RANGE_MS[range];

const HOUR_MS = 3_600_000;
// Same end as the server's overview window: the hour starting at H can be rolled from H + 95 min.
export function rolledWindow(range: StatsRange, now = Date.now()) {
  const until = Math.floor((now - 95 * 60_000) / HOUR_MS) * HOUR_MS + HOUR_MS;
  return { since: until - RANGE_MS[range], until };
}

// Each query's options are shared by its hook and by the Analytics prefetch (prefetch.ts), so a
// prefetched request is the very one the tab picks up when it mounts.
export const statsSeriesQuery = (s: StatsScope, range: StatsRange) => queryOptions({
  queryKey: ["stats-series", s.regionKey, range],
  ...gatedOn(s.isResolved, (signal) => {
    const { since, until } = rolledWindow(range);
    return getStatsSeries(since, until, s.where, signal);
  }),
  ...common,
  refetchInterval: 60_000,
});

export const statsObservationsQuery = (s: StatsScope, range: StatsRange) => queryOptions({
  queryKey: ["stats-observations", s.regionKey, range],
  ...gatedOn(s.isResolved, (signal) => getStatsObservations(s.where, sinceFor(range), signal)),
  ...common,
  // feeds the observations chart + sparklines and gets no WS bumps, so refetch to stay fresh
  refetchInterval: 60_000,
});

export const payloadBreakdownQuery = (s: StatsScope, range: StatsRange) => queryOptions({
  queryKey: ["stats-payload", s.regionKey, range],
  ...gatedOn(s.isResolved, () => getPayloadBreakdown(s.where, sinceFor(range))),
  ...common,
});

export const topNodesQuery = (s: StatsScope, range: StatsRange, limit = 10) => queryOptions({
  queryKey: ["stats-top-nodes", s.regionKey, range, limit],
  ...gatedOn(s.isResolved, () => getTopNodes(s.where, sinceFor(range), limit)),
  ...common,
});

export const topObserversQuery = (s: StatsScope, range: StatsRange, limit = 10) => queryOptions({
  queryKey: ["stats-top-observers", s.regionKey, range, limit],
  ...gatedOn(s.isResolved, () => getTopObservers(s.where, sinceFor(range), limit)),
  ...common,
});

export const topAdvertisersQuery = (s: StatsScope, range: StatsRange, sort: AdvertiserSort, limit = 10) => queryOptions({
  queryKey: ["stats-top-advertisers", s.regionKey, range, sort, limit],
  ...gatedOn(s.isResolved, () => getTopAdvertisers(s.where, sinceFor(range), sort, limit)),
  ...common,
});

export const topTalkersQuery = (s: StatsScope, range: StatsRange, limit = 10) => queryOptions({
  queryKey: ["stats-top-talkers", s.regionKey, range, limit],
  ...gatedOn(s.isResolved, () => getTopTalkers(s.where, sinceFor(range), limit)),
  ...common,
});

export const radioPresetsQuery = (s: StatsScope) => queryOptions({
  queryKey: ["stats-radio-presets", s.regionKey],
  ...gatedOn(s.isResolved, () => getRadioPresets(s.where)),
  ...common,
});

// node-types is a population census (no time window), so the key is region-only
export const nodeTypesQuery = (s: StatsScope) => queryOptions({
  queryKey: ["stats-node-types", s.regionKey],
  ...gatedOn(s.isResolved, () => getStatsNodeTypes(s.where)),
  ...common,
});

// clock drift reflects each node's latest measured drift, not a windowed aggregate, so region-only
export const clockDriftQuery = (s: StatsScope, limit = 100) => queryOptions({
  queryKey: ["stats-clock-drift", s.regionKey, limit],
  ...gatedOn(s.isResolved, () => getClockDrift(s.where, limit)),
  ...common,
});

// Packet counts are windowed from the series' first rolled hour so both cover the same hours;
// observer and node counts are current membership.
export const scopesQuery = (s: StatsScope, range: StatsRange) => queryOptions({
  queryKey: ["stats-scopes", s.regionKey, range],
  ...gatedOn(s.isResolved, (signal) => getStatsScopes(s.where, rolledWindow(range).since, signal)),
  ...common,
  refetchInterval: 60_000,
});

export const useStatsSeries = (range: StatsRange) => useQuery(statsSeriesQuery(useStatsRegion(), range));
export const useStatsObservations = (range: StatsRange) => useQuery(statsObservationsQuery(useStatsRegion(), range));
export const usePayloadBreakdown = (range: StatsRange) => useQuery(payloadBreakdownQuery(useStatsRegion(), range));
export const useTopNodes = (range: StatsRange, limit = 10) => useQuery(topNodesQuery(useStatsRegion(), range, limit));
export const useTopObservers = (range: StatsRange, limit = 10) => useQuery(topObserversQuery(useStatsRegion(), range, limit));
export const useTopAdvertisers = (range: StatsRange, sort: AdvertiserSort, limit = 10) =>
  useQuery(topAdvertisersQuery(useStatsRegion(), range, sort, limit));
export const useTopTalkers = (range: StatsRange, limit = 10) => useQuery(topTalkersQuery(useStatsRegion(), range, limit));
export const useRadioPresets = () => useQuery(radioPresetsQuery(useStatsRegion()));
export const useNodeTypes = () => useQuery(nodeTypesQuery(useStatsRegion()));
export const useClockDrift = (limit = 100) => useQuery(clockDriftQuery(useStatsRegion(), limit));
export const useScopes = (range: StatsRange) => useQuery(scopesQuery(useStatsRegion(), range));
