import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { me } from "../api/auth";
import { queryRetryDefaults } from "../api/rate-limit";
import { useFeatures } from "./useFeatures";
import type { User } from "../features/account/types";

export const SESSION_KEY = ["me"] as const;

// Private account queries all sit under ["me", ...]; the session itself is exactly ["me"].
const isPrivate = (key: readonly unknown[]) => key[0] === "me" && key.length > 1;

// Bumped by every sign-in, sign-out, delete and identity change. A mutation captures it when it
// starts and does nothing to the session if it moved on, even if the same user signed back in.
const generations = new WeakMap<QueryClient, number>();
const bump = (queryClient: QueryClient) => generations.set(queryClient, (generations.get(queryClient) ?? 0) + 1);

// Returns a check that stays true only while the session is the one it was taken under.
export function sessionSnapshot(queryClient: QueryClient): () => boolean {
  const taken = generations.get(queryClient) ?? 0;
  return () => (generations.get(queryClient) ?? 0) === taken;
}

// Everything the last identity left behind: private queries (cancelled, then removed) and every
// mutation, so no typed secret or callback outlives the session.
function wipePrivate(queryClient: QueryClient): void {
  bump(queryClient);
  void queryClient.cancelQueries({ predicate: (q) => isPrivate(q.queryKey) });
  queryClient.removeQueries({ predicate: (q) => isPrivate(q.queryKey) });
  queryClient.getMutationCache().clear();
}

// A session change wipes what the last account cached and cancels the old /me, so a late answer cannot undo it.
function replaceSession(queryClient: QueryClient, value: User | null): void {
  void queryClient.cancelQueries({ queryKey: SESSION_KEY, exact: true });
  wipePrivate(queryClient);
  queryClient.setQueryData(SESSION_KEY, value);
}

// An explicit sign-in is always a transition, even for the user who was already there.
export function startSession(queryClient: QueryClient, user: User): void {
  replaceSession(queryClient, user);
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

async function lookup(signal: AbortSignal): Promise<User | null> {
  try {
    return (await me.get(signal)).user;
  } catch (err) {
    // 401 is signed out; 404 is accounts_disabled. Neither is an error.
    const status = (err as { status?: unknown } | null)?.status;
    if (status === 401 || status === 404) return null;
    throw err;
  }
}

export function useSession(): { user: User | null; loading: boolean; enabled: boolean; refresh(): void } {
  const enabled = useFeatures().accounts !== "off";
  const queryClient = useQueryClient();
  const query = useQuery<User | null>({
    queryKey: SESSION_KEY,
    queryFn: async ({ signal }) => {
      const found = await lookup(signal);
      // Another tab can change the shared cookie: a different identity here is a transition too.
      const before = queryClient.getQueryData<User | null>(SESSION_KEY);
      if (before !== undefined && (before?.id ?? null) !== (found?.id ?? null)) wipePrivate(queryClient);
      return found;
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
