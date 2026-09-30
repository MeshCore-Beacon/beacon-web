import { getPathStats } from "../../api/client";
import { useWindowedStats } from "./useWindowedStats";
import type { StatsRange } from "./types";

export function usePathStats(range: StatsRange) {
  return useWindowedStats("stats-paths", range, getPathStats);
}
