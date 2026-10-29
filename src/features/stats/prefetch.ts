import type { QueryClient } from "@tanstack/react-query";
import { getPathStats, getSignalStats } from "../../api/client";
import {
  clockDriftQuery,
  nodeTypesQuery,
  payloadBreakdownQuery,
  radioPresetsQuery,
  scopesQuery,
  statsObservationsQuery,
  statsSeriesQuery,
  topAdvertisersQuery,
  topNodesQuery,
  topObserversQuery,
  topTalkersQuery,
  type StatsScope,
} from "./useStats";
import { windowedStatsQuery } from "./useWindowedStats";
import type { StatsRange, StatsTab } from "./types";

type Prefetch = (qc: QueryClient, s: StatsScope, range: StatsRange) => Promise<void>[];

// What each sub-tab requests when it mounts (same options, so it picks these up). The graph and
// compare tabs page or wait on a selection, so they still load on mount.
const TAB_QUERIES: Partial<Record<StatsTab, Prefetch>> = {
  mesh: (qc, s, range) => [
    qc.prefetchQuery(statsSeriesQuery(s, "24h")),
    qc.prefetchQuery(statsSeriesQuery(s, range)),
    qc.prefetchQuery(payloadBreakdownQuery(s, range)),
    qc.prefetchQuery(topNodesQuery(s, range, 10)),
    qc.prefetchQuery(topObserversQuery(s, range, 8)),
    qc.prefetchQuery(radioPresetsQuery(s)),
    qc.prefetchQuery(scopesQuery(s, range)),
    qc.prefetchQuery(nodeTypesQuery(s)),
  ],
  traffic: (qc, s, range) => [qc.prefetchQuery(statsObservationsQuery(s, range))],
  signal: (qc, s, range) => [qc.prefetchQuery(windowedStatsQuery("stats-signal", s, range, getSignalStats))],
  paths: (qc, s, range) => [qc.prefetchQuery(windowedStatsQuery("stats-paths", s, range, getPathStats))],
  scopes: (qc, s, range) => [qc.prefetchQuery(scopesQuery(s, range)), qc.prefetchQuery(statsSeriesQuery(s, range))],
  talkers: (qc, s, range) => [
    qc.prefetchQuery(topAdvertisersQuery(s, range, "flood", 20)),
    qc.prefetchQuery(topTalkersQuery(s, range, 20)),
  ],
  clockdrift: (qc, s) => [qc.prefetchQuery(clockDriftQuery(s))],
};

// Starts an Analytics sub-tab's requests alongside its lazy chunk instead of after it mounts, which
// waits on the chunk and React's Suspense reveal. Fresh cached data isn't fetched again.
export function prefetchStatsTab(qc: QueryClient, tab: StatsTab, range: StatsRange, s: StatsScope): void {
  if (s.isResolved === false) return;
  TAB_QUERIES[tab]?.(qc, s, range);
}
