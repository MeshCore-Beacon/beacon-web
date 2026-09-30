import { useQuery } from "@tanstack/react-query";
import { useRegion } from "../../hooks/useRegion";
import { RANGE_MS, type StatsRange } from "./types";

// Shared by usePathStats/useSignalStats (and any future /stats/* window query): resolves the
// region, floors the window to minute boundaries and polls every minute.
export function useWindowedStats<T>(
  key: string,
  range: StatsRange,
  fetch: (since: number, until: number, iatas: string[] | undefined, signal?: AbortSignal) => Promise<T>,
) {
  const { iatas, regionKey, isResolved } = useRegion();
  return useQuery({
    queryKey: [key, isResolved === false ? `${regionKey}:pending` : regionKey, range],
    enabled: isResolved !== false,
    queryFn: ({ signal }) => {
      if (isResolved === false) throw new Error("Selected region is not available yet");
      // Shared minute boundaries let viewers reuse server aggregates without changing the key every render.
      const until = Math.floor(Date.now() / 60_000) * 60_000;
      return fetch(until - RANGE_MS[range], until, iatas, signal);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}
