import { useSyncExternalStore } from "react";
import { getRateLimitedUntil, subscribeRateLimit } from "../api/rate-limit";

// epoch ms until which the API is throttling us, or null
export function useRateLimit(): number | null {
  return useSyncExternalStore(subscribeRateLimit, getRateLimitedUntil);
}
