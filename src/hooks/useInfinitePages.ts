import { useEffect, useMemo } from "react";
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
}

// Auto-chain a cursor-paginated endpoint page by page as each settles, so the caller's list fills
// incrementally instead of waiting for one big response. Loads once per key (staleTime Infinity, no
// maxPages); dedupes by id because a non-unique cursor can repeat a row across a page boundary.
// Shared by the map and the entity tables.
export function useInfinitePages<T>({ queryKey, queryFn, getId, keepPrevious }: UseInfinitePagesOptions<T>) {
  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isError, isFetchNextPageError, isLoading } =
    useInfiniteQuery({
      queryKey,
      queryFn: ({ pageParam }) => queryFn(pageParam),
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      initialPageParam: undefined as number | undefined,
      staleTime: Infinity,
      placeholderData: keepPrevious ? keepPreviousData : undefined,
    });

  // Chain to the next page once the current settles — this streams rows in batch by batch. Bail on a
  // page error: a failed fetchNextPage adds no page, so hasNextPage stays true while
  // isFetchingNextPage drops to false; without the guard the effect would retry the failure forever.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

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
    // drop the loading state on error so the pill hides instead of hanging on (hasNextPage stays
    // true after a failed page); callers surface isError separately.
    isPaging: (isFetching || hasNextPage) && !errored,
    isError: errored,
    isLoading,
  };
}
