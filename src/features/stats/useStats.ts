import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useRegion } from "../../hooks/useRegion";
import {
  getStatsOverview,
  getStatsObservations,
  getPayloadBreakdown,
  getTopNodes,
  getTopObservers,
  getRadioPresets,
  getStatsScopes,
  getStatsNodeTypes,
} from "../../api/client";
import { RANGE_MS, type StatsRange } from "./types";

// Shared query options: cache for 30s, keep previous data so region/range switches don't flash.
const common = {
  staleTime: 30_000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

// `since` is computed inside queryFn so refetches use a fresh window without churning the query key.
const sinceFor = (range: StatsRange) => Date.now() - RANGE_MS[range];

export function useStatsOverview() {
  const { iatas, regionKey } = useRegion();
  return useQuery({
    queryKey: ["stats-overview", regionKey],
    queryFn: () => getStatsOverview(iatas),
    ...common,
    // self-correct the WS-accumulated live counters against the server
    refetchInterval: 60_000,
  });
}

export function useStatsObservations(range: StatsRange) {
  const { iatas, regionKey } = useRegion();
  return useQuery({
    queryKey: ["stats-observations", regionKey, range],
    queryFn: () => getStatsObservations(iatas, sinceFor(range)),
    ...common,
    // feeds the observations chart + sparklines and gets no WS bumps, so refetch to stay fresh
    refetchInterval: 60_000,
  });
}

export function usePayloadBreakdown(range: StatsRange) {
  const { iatas, regionKey } = useRegion();
  return useQuery({
    queryKey: ["stats-payload", regionKey, range],
    queryFn: () => getPayloadBreakdown(iatas, sinceFor(range)),
    ...common,
  });
}

export function useTopNodes(limit = 10) {
  const { iatas, regionKey } = useRegion();
  return useQuery({
    queryKey: ["stats-top-nodes", regionKey, limit],
    queryFn: () => getTopNodes(iatas, limit),
    ...common,
  });
}

export function useTopObservers(range: StatsRange, limit = 10) {
  const { iatas, regionKey } = useRegion();
  return useQuery({
    queryKey: ["stats-top-observers", regionKey, range, limit],
    queryFn: () => getTopObservers(iatas, sinceFor(range), limit),
    ...common,
  });
}

export function useRadioPresets() {
  const { iatas, regionKey } = useRegion();
  return useQuery({
    queryKey: ["stats-radio-presets", regionKey],
    queryFn: () => getRadioPresets(iatas),
    ...common,
  });
}

// node-types is a population census (no time window), so the key is region-only
export function useNodeTypes() {
  const { iatas, regionKey } = useRegion();
  return useQuery({
    queryKey: ["stats-node-types", regionKey],
    queryFn: () => getStatsNodeTypes(iatas),
    ...common,
  });
}

// scopes are reported globally by the backend (no region filter), so the key is region-independent
export function useScopes() {
  return useQuery({
    queryKey: ["stats-scopes"],
    queryFn: getStatsScopes,
    ...common,
  });
}
