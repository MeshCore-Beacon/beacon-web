import { useQuery, type QueryClient } from "@tanstack/react-query";
import { me } from "../api/auth";
import { queryRetryDefaults } from "../api/rate-limit";
import { useFeatures } from "./useFeatures";
import type { User } from "../features/account/types";

export const SESSION_KEY = ["me"] as const;

export function setSessionUser(queryClient: QueryClient, user: User): void {
  queryClient.setQueryData(SESSION_KEY, user);
}

// null (not removal) so a signed-out page does not refetch /me.
export function clearSession(queryClient: QueryClient): void {
  queryClient.setQueryData(SESSION_KEY, null);
}

export function useSession(): { user: User | null; loading: boolean; enabled: boolean; refresh(): void } {
  const enabled = useFeatures().accounts !== "off";
  const query = useQuery<User | null>({
    queryKey: SESSION_KEY,
    queryFn: async ({ signal }) => {
      try {
        return (await me.get(signal)).user;
      } catch (err) {
        // 401 is signed out; 404 is accounts_disabled. Neither is an error.
        const status = (err as { status?: unknown } | null)?.status;
        if (status === 401 || status === 404) return null;
        throw err;
      }
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    ...queryRetryDefaults,
  });
  return {
    user: enabled ? (query.data ?? null) : null,
    loading: enabled && query.isPending,
    enabled,
    refresh: () => void query.refetch(),
  };
}
