import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getScopes } from "../api/client";
import { useRegion } from "./useRegion";

// Scope names for the filter dropdowns, limited to the selected region ("All" lists every scope).
// `keep` is the current selection: it stays an option even when outside the region, so a shared link
// still filters. The filtering itself stays client-side on each record's scope.
export function useScopes(keep?: string | string[]): string[] {
  const { iatas, regionKey, isResolved } = useRegion();
  const { data } = useQuery({
    queryKey: ["scopes", regionKey],
    queryFn: () => getScopes(iatas),
    enabled: isResolved !== false,
    staleTime: 5 * 60_000,
  });

  const kept = typeof keep === "string" ? keep : keep?.join("\n");
  return useMemo(() => {
    const names = new Set(data ?? []);
    for (const k of kept ? kept.split("\n") : []) names.add(k);
    return [...names].sort();
  }, [data, kept]);
}
