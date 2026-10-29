import { useCallback, useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getObserverDirectoryPage, getServerInfo } from "../../api/client";
import { queryRetryDelay } from "../../api/rate-limit";
import { isBelowVersion } from "../../lib/version";
import { API_BASE } from "../../lib/constants";
import { useWsObserverStatusHandler } from "../../hooks/useWsHandlers";
import { useStatsRegion } from "../stats/useStats";
import type { ObserverDirectoryItem, ObserverDirectoryPage, ObserverDirectorySort } from "./types";
import type { WsManager } from "../../api/ws-manager";
import type { WsObserverStatus } from "../../types/ws";

export interface ObserverDirectoryOptions {
  sort: ObserverDirectorySort;
  search: string;
  status: string;
  type: string;
  broker: string;
  scope: string;
}

type Continuation = { cursor: number; since: number; until: number } | undefined;
export function useObserverDirectory(wsManager: WsManager, options: ObserverDirectoryOptions) {
  const { where, regionKey, isResolved } = useStatsRegion();
  const { sort, search, status, type, broker, scope } = options;
  const queryClient = useQueryClient();
  // The version gate has already loaded /info; sharing its query keeps it from delaying the list.
  const info = useQuery({
    queryKey: ["server-info"],
    queryFn: getServerInfo,
    enabled: isResolved !== false,
    staleTime: 60_000,
    retryDelay: queryRetryDelay,
  });
  // a server without /info predates the directory
  const noInfo = (info.error as { status?: unknown } | null)?.status === 404;
  const supported = noInfo ? false : info.data ? !isBelowVersion(info.data.serverVersion, "2.0.2") : undefined;
  const queryKey = useMemo(() => ["observer-directory", API_BASE, regionKey, sort, search, status, type, broker, scope],
    [regionKey, sort, search, status, type, broker, scope]);
  const list = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => getObserverDirectoryPage({
      location: where, sort, name: search || undefined, status: status || undefined,
      type: type || undefined, broker: broker || undefined, scope: scope || undefined, ...pageParam, limit: 200,
    }, signal),
    // Refetch starts unbounded; later pages take their bounds from the new first response.
    initialPageParam: undefined as Continuation,
    getNextPageParam: (last, pages, _lastParam, params): Continuation => {
      const first = pages[0];
      if (!first || last.effectiveSort !== first.effectiveSort || !last.hasMore || last.nextCursor == null || last.nextCursor === 0 ||
          params.some(p => p?.cursor === last.nextCursor)) return undefined;
      return { cursor: last.nextCursor, since: first.windowStart, until: first.windowEnd };
    },
    enabled: isResolved !== false && supported === true,
    staleTime: Infinity,
    refetchInterval: 60_000,
    gcTime: 0,
    retryDelay: queryRetryDelay,
  });
  const first = list.data?.pages[0];
  const sortChanged = list.data?.pages.some(page => page.effectiveSort !== first?.effectiveSort) ?? false;
  const resetKey = JSON.stringify(queryKey);
  const restartedKey = useRef<string | null>(null);
  useEffect(() => {
    // Coverage can oscillate during corrections; restart automatically only once per query.
    if (sortChanged && restartedKey.current !== resetKey) {
      restartedKey.current = resetKey;
      void queryClient.resetQueries({ queryKey, exact: true });
    }
  }, [sortChanged, resetKey, queryClient, queryKey]);

  const onStatus = useCallback((data: WsObserverStatus["data"]) => {
    queryClient.setQueryData<InfiniteData<ObserverDirectoryPage, Continuation>>(queryKey, old => old && ({
      ...old,
      pages: old.pages.map(page => ({ ...page, items: page.items.map(row => row.id !== data.observerId ? row : {
        ...row, status: data.online ? "online" : "offline", lastStatusAt: data.lastStatusAt || row.lastStatusAt,
      }) })),
    }));
  }, [queryClient, queryKey]);
  useWsObserverStatusHandler(wsManager, onStatus);

  const observers = useMemo(() => {
    const seen = new Set<string>();
    const rows: ObserverDirectoryItem[] = [];
    for (const page of list.data?.pages ?? []) {
      if (page.effectiveSort !== list.data?.pages[0]?.effectiveSort) break;
      for (const row of page.items) {
        if (!seen.has(row.id)) { seen.add(row.id); rows.push(row); }
      }
    }
    return rows;
  }, [list.data]);
  const { fetchNextPage, hasNextPage, isFetching } = list;
  const loadMore = useCallback(async () => {
    if (hasNextPage && !isFetching) await fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, hasNextPage, isFetching]);
  const refresh = async () => {
    restartedKey.current = null;
    await queryClient.resetQueries({ queryKey, exact: true });
  };
  const retry = async () => {
    if (supported !== true) await info.refetch();
    else if (list.isFetchNextPageError && !sortChanged) await loadMore();
    else await refresh();
  };
  return {
    observers,
    observerTypes: first?.observerTypes ?? [],
    maxObservationCount: first?.maxObservationCount ?? null,
    coverage: first?.coverage,
    effectiveSort: first?.effectiveSort,
    windowEnd: first?.windowEnd,
    resetKey,
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    isPending: !info.isError && supported !== false && (info.isPending || list.isPending),
    isError: (info.isError && !noInfo) || list.isError || sortChanged,
    unsupported: supported === false,
    loadMore,
    retry,
    refresh,
  };
}
