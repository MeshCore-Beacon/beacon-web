import { getSignalStats } from "../../api/client";
import { useWindowedStats } from "./useWindowedStats";
import type { StatsRange } from "./types";

export function useSignalStats(range: StatsRange) {
  return useWindowedStats("stats-signal", range, getSignalStats);
}
