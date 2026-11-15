import { useQuery } from "@tanstack/react-query";
import { requests } from "../api/auth";
import { queryRetryDefaults } from "../api/rate-limit";
import { useFeatures } from "./useFeatures";
import { useSession } from "./useSession";

// The server counts bytes, so a multi-byte character can still be refused as password_invalid.
export const GUEST_PASSWORD_MAX = 15;
export const TELEMETRY_REQUESTS_KEY = ["me", "telemetry-requests"] as const;

// True when a signed-in user can see and use telemetry requests.
export function useRequestsAvailable(): boolean {
  const { user } = useSession();
  const { telemetryRequests } = useFeatures();
  return !!user && telemetryRequests;
}

export function useTelemetryRequests() {
  const enabled = useRequestsAvailable();
  return useQuery({
    queryKey: TELEMETRY_REQUESTS_KEY,
    queryFn: ({ signal }) => requests.list(signal),
    enabled,
    staleTime: 30_000,
    ...queryRetryDefaults,
  });
}
