import { useQuery } from "@tanstack/react-query";
import { alerts } from "../api/auth";
import { queryRetryDefaults } from "../api/rate-limit";
import { useFeatures } from "./useFeatures";
import { useSession } from "./useSession";

export const ALERTS_KEY = ["me", "alerts"] as const;

export function useAlerts() {
  const { user } = useSession();
  const { alerts: on } = useFeatures();
  return useQuery({
    queryKey: ALERTS_KEY,
    queryFn: ({ signal }) => alerts.get(signal),
    enabled: !!user && on,
    staleTime: 30_000,
    ...queryRetryDefaults,
  });
}
