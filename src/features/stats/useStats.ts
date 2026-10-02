import { useQuery, keepPreviousData } from "@tanstack/react-query";
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
import { RANGE_MS, type StatsRange } from "./types";

// Shared query options: cache for 30s; previous data stays as placeholder so tabs can decide whether to show it during a switch.
const common = {
  staleTime: 30_000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

// A region with no member IATAs is sent by slug so the server returns zeros rather than every IATA.
export function useStatsRegion() {
  const { iatas, regionKey, isResolved, emptyRegion } = useRegion();
  const where: StatsRegion = emptyRegion ? { region: emptyRegion } : iatas;
  return { where, regionKey, isResolved };
}

// `since` is computed inside queryFn so refetches use a fresh window without churning the query key.
const sinceFor = (range: StatsRange) => Date.now() - RANGE_MS[range];

const HOUR_MS = 3_600_000;
// Same end as the server's overview window: the hour starting at H can be rolled from H + 95 min.
export function rolledWindow(range: StatsRange, now = Date.now()) {
  const until = Math.floor((now - 95 * 60_000) / HOUR_MS) * HOUR_MS + HOUR_MS;
  return { since: until - RANGE_MS[range], until };
}

export function useStatsSeries(range: StatsRange) {
  const { where, regionKey, isResolved } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-series", regionKey, range],
    enabled: isResolved !== false,
    queryFn: ({ signal }) => {
      if (isResolved === false) throw new Error("Selected region is not available yet");
      const { since, until } = rolledWindow(range);
      return getStatsSeries(since, until, where, signal);
    },
    ...common,
    refetchInterval: 60_000,
  });
}

export function useStatsObservations(range: StatsRange) {
  const { where, regionKey, isResolved } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-observations", regionKey, range],
    enabled: isResolved !== false,
    queryFn: ({ signal }) => {
      if (isResolved === false) throw new Error("Selected region is not available yet");
      return getStatsObservations(where, sinceFor(range), signal);
    },
    ...common,
    // feeds the observations chart + sparklines and gets no WS bumps, so refetch to stay fresh
    refetchInterval: 60_000,
  });
}

export function usePayloadBreakdown(range: StatsRange) {
  const { where, regionKey } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-payload", regionKey, range],
    queryFn: () => getPayloadBreakdown(where, sinceFor(range)),
    ...common,
  });
}

export function useTopNodes(range: StatsRange, limit = 10) {
  const { where, regionKey } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-top-nodes", regionKey, range, limit],
    queryFn: () => getTopNodes(where, sinceFor(range), limit),
    ...common,
  });
}

export function useTopObservers(range: StatsRange, limit = 10) {
  const { where, regionKey } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-top-observers", regionKey, range, limit],
    queryFn: () => getTopObservers(where, sinceFor(range), limit),
    ...common,
  });
}

export function useTopAdvertisers(range: StatsRange, limit = 10) {
  const { where, regionKey } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-top-advertisers", regionKey, range, limit],
    queryFn: () => getTopAdvertisers(where, sinceFor(range), limit),
    ...common,
  });
}

export function useTopTalkers(range: StatsRange, limit = 10) {
  const { where, regionKey } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-top-talkers", regionKey, range, limit],
    queryFn: () => getTopTalkers(where, sinceFor(range), limit),
    ...common,
  });
}

export function useRadioPresets() {
  const { where, regionKey } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-radio-presets", regionKey],
    queryFn: () => getRadioPresets(where),
    ...common,
  });
}

// node-types is a population census (no time window), so the key is region-only
export function useNodeTypes() {
  const { where, regionKey } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-node-types", regionKey],
    queryFn: () => getStatsNodeTypes(where),
    ...common,
  });
}

// clock drift reflects each node's latest measured drift, not a windowed aggregate, so region-only
export function useClockDrift(limit = 100) {
  const { where, regionKey } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-clock-drift", regionKey, limit],
    queryFn: () => getClockDrift(where, limit),
    ...common,
  });
}

// Packet counts are windowed; observer and node counts are current membership.
export function useScopes(range: StatsRange) {
  const { where, regionKey, isResolved } = useStatsRegion();
  return useQuery({
    queryKey: ["stats-scopes", regionKey, range],
    enabled: isResolved !== false,
    queryFn: ({ signal }) => {
      if (isResolved === false) throw new Error("Selected region is not available yet");
      return getStatsScopes(where, sinceFor(range), signal);
    },
    ...common,
    refetchInterval: 60_000,
  });
}
