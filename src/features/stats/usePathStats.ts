import { useQuery } from "@tanstack/react-query";
import { getPathStats } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { RANGE_MS, type StatsRange } from "./types";

export function usePathStats(range: StatsRange) {
  const { iatas, regionKey, isResolved } = useRegion();
  return useQuery({
    queryKey: ["stats-paths", isResolved === false ? `${regionKey}:pending` : regionKey, range],
    enabled: isResolved !== false,
    queryFn: ({ signal }) => {
      if (isResolved === false) throw new Error("Selected region is not available yet");
      // Shared minute boundaries let viewers reuse server aggregates without changing the key every render.
      const until = Math.floor(Date.now() / 60_000) * 60_000;
      return getPathStats(until - RANGE_MS[range], until, iatas, signal);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
