import { useCallback, useEffect, useMemo } from "react";
import { useInfiniteQuery, keepPreviousData, type QueryKey } from "@tanstack/react-query";
import type { CursorPage } from "../types/api";

interface UseInfinitePagesOptions<T> {
  queryKey: QueryKey;
  // fetch one page; cursor is the previous page's nextCursor (undefined for the first page)
  queryFn: (cursor: number | undefined) => Promise<CursorPage<T>>;
  // stable id accessor for dedup — pass a module-level fn so the memo isn't rebuilt every render
  getId: (item: T) => string;
  // keep the prior key's rows on screen while a new key (e.g. a filter change) loads its first page
  keepPrevious?: boolean;
  // auto-chain every page eagerly (default). false = load only the first page; the caller pulls the
  // rest via loadMore() (e.g. on scroll) so a large dataset isn't fetched all at once.
  auto?: boolean;
}

// Page through a cursor-paginated endpoint. By default it auto-chains page by page as each settles so
// the caller's list fills incrementally instead of waiting for one big response; pass auto:false to
// load only the first page and pull the rest on demand via loadMore(). Loads once per key (staleTime
// Infinity, no maxPages); dedupes by id because a non-unique cursor can repeat a row across a page
// boundary. Shared by the map and the entity tables.
export function useInfinitePages<T>({ queryKey, queryFn, getId, keepPrevious, auto = true }: UseInfinitePagesOptions<T>) {
  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isError, isFetchNextPageError, isLoading } =
    useInfiniteQuery({
      queryKey,
      queryFn: ({ pageParam }) => queryFn(pageParam),
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      initialPageParam: undefined as number | undefined,
      staleTime: Infinity,
      placeholderData: keepPrevious ? keepPreviousData : undefined,
    });

  // Fetch the next page only when it's safe to: there's more, nothing in flight, and the last attempt
  // didn't fail. The error guard matters because a failed fetchNextPage adds no page, so hasNextPage
  // stays true while isFetchingNextPage drops to false — without it we'd retry the failure forever.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  // In auto mode, chain to the next page once the current settles — this streams rows batch by batch.
  // In on-demand mode the caller drives loadMore() instead.
  useEffect(() => {
    if (auto) loadMore();
  }, [auto, loadMore]);

  const items = useMemo<T[]>(() => {
    const seen = new Set<string>();
    return (data?.pages.flatMap((p) => p.items) ?? []).filter((it) => {
      const id = getId(it);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [data, getId]);

  const errored = isError || isFetchNextPageError;
  return {
    items,
    loadedCount: items.length,
    // drop the loading state on error so the pill hides instead of hanging on (hasNextPage stays true
    // after a failed page); callers surface isError separately. In auto mode hasNextPage counts as
    // "still paging" (more is coming); in on-demand mode only an in-flight fetch does.
    isPaging: (isFetching || (auto && hasNextPage)) && !errored,
    isError: errored,
    isLoading,
    hasMore: hasNextPage && !errored,
    loadMore,
  };
}
