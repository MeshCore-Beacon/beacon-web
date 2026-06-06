import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getScopes } from "../api/client";

// The configured transport scope names (e.g. "#bc", "#west"), from /scopes. This is the authoritative
// list — the scope filters use it for their options so they show every configured scope even before any
// packet/node/observer has been matched to one. Scopes are near-static, so cache long and share across
// tabs via React Query. The filtering itself stays client-side on each record's scope.
export function useScopes(): string[] {
  const { data } = useQuery({
    queryKey: ["scopes"],
    queryFn: getScopes,
    staleTime: 5 * 60_000,
  });

  return useMemo(() => [...(data ?? [])].sort(), [data]);
}
