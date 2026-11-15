import { useQuery, type QueryClient } from "@tanstack/react-query";
import { me } from "../api/auth";
import { queryRetryDefaults } from "../api/rate-limit";
import { useFeatures } from "./useFeatures";
import type { User } from "../features/account/types";

export const SESSION_KEY = ["me"] as const;

// Private account queries all sit under ["me", ...]; the session itself is exactly ["me"].
const isPrivate = (key: readonly unknown[]) => key[0] === "me" && key.length > 1;

// A session change wipes what the last account cached and cancels the old /me, so a late answer cannot undo it.
function replaceSession(queryClient: QueryClient, value: User | null): void {
  void queryClient.cancelQueries({ queryKey: SESSION_KEY, exact: true });
  void queryClient.cancelQueries({ predicate: (q) => isPrivate(q.queryKey) });
  queryClient.removeQueries({ predicate: (q) => isPrivate(q.queryKey) });
  queryClient.setQueryData(SESSION_KEY, value);
}

// The same user (a display name edit) keeps their cached data.
export function setSessionUser(queryClient: QueryClient, user: User): void {
  const current = queryClient.getQueryData<User | null>(SESSION_KEY);
  if (current?.id === user.id) queryClient.setQueryData(SESSION_KEY, user);
  else replaceSession(queryClient, user);
}

// null (not removal) so a signed-out page does not refetch /me.
export function clearSession(queryClient: QueryClient): void {
  replaceSession(queryClient, null);
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
