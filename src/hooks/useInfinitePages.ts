import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, keepPreviousData, type QueryKey } from "@tanstack/react-query";
import type { CursorPage, PageParam } from "../types/api";
import { rateLimitWaitMs } from "../api/rate-limit";
import { fetchPage, nextPageParam } from "../api/paging";
import { releasePage, reservePage } from "../api/page-pacer";
import { createPageFlattener } from "../lib/infinite-pages";

// While a list pages itself in, its rows reach the caller at most this often: re-rendering a big
// table for every page was most of the client's work. The first page and the last show at once.
const COMMIT_MS = 1_000;

interface UseInfinitePagesOptions<T, C, P extends CursorPage<T, C>> {
  queryKey: QueryKey;
  // fetch one page; page is the previous page's next cursors (undefined for the first page)
  queryFn: (page: PageParam<C> | undefined) => Promise<P>;
  // stable id accessor for dedup — pass a module-level fn so the memo isn't rebuilt every render
  getId: (item: T) => string;
  // keep the prior key's rows on screen while a new key (e.g. a filter change) loads its first page
  keepPrevious?: boolean;
  // auto-chain every page eagerly (default). false = load only the first page; the caller pulls the
  // rest via loadMore() (e.g. on scroll) so a large dataset isn't fetched all at once.
  auto?: boolean;
  // false = don't fetch at all (idle query). Lets a caller gate a heavy load off — e.g. the neighbour
  // graph skips the ~5k-node "All regions" fetch until a region is picked.
  enabled?: boolean;
}

// Page through a cursor-paginated endpoint. By default it auto-chains page by page as each settles so
// the caller's list fills incrementally instead of waiting for one big response; pass auto:false to
// load only the first page and pull the rest on demand via loadMore(). Loads once per key (staleTime
// Infinity, no maxPages); dedupes by id because a non-unique cursor can repeat a row across a page
// boundary. Shared by the map and the entity tables.
export function useInfinitePages<T, C = number, P extends CursorPage<T, C> = CursorPage<T, C>>({ queryKey, queryFn, getId, keepPrevious, auto = true, enabled = true }: UseInfinitePagesOptions<T, C, P>) {
  const { data, error, refetch, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isError, isFetchNextPageError, isLoading } =
    useInfiniteQuery({
      queryKey,
      queryFn: ({ pageParam }) => fetchPage(pageParam, queryFn),
      getNextPageParam: nextPageParam,
      initialPageParam: undefined as PageParam<C> | undefined,
      staleTime: Infinity,
      enabled,
      placeholderData: keepPrevious ? keepPreviousData : undefined,
    });

  // Fetch the next page only when it's safe to: there's more, nothing in flight, and the last attempt
  // didn't fail. The error guard matters because a failed fetchNextPage adds no page, so hasNextPage
  // stays true while isFetchingNextPage drops to false — without it we'd retry the failure forever.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  // In auto mode, chain to the next page once the current settles — this streams rows batch by batch,
  // paced by the shared page budget. In on-demand mode the caller drives loadMore() instead.
  const canChain = auto && enabled && hasNextPage && !isFetchingNextPage && !isFetchNextPageError;
  // the page count re-arms the chain even when a fast page lands within one render
  const pageCount = data?.pages.length ?? 0;
  useEffect(() => {
    if (!canChain) return;
    let fired = false;
    const fetchNow = () => {
      fired = true;
      void fetchNextPage();
    };
    const wait = reservePage();
    if (wait <= 0) {
      fetchNow();
      return;
    }
    const timer = setTimeout(fetchNow, wait);
    return () => {
      if (fired) return;
      clearTimeout(timer);
      releasePage();
    };
  }, [canChain, pageCount, fetchNextPage]);

  // A 429 is a pause, not a failure: once Retry-After has passed, ask again for the page it refused.
  const rateLimited = rateLimitWaitMs(error) !== undefined;
  useEffect(() => {
    const wait = rateLimitWaitMs(error);
    if (wait === undefined || !enabled || isFetching) return;
    const timer = setTimeout(() => void (isFetchNextPageError ? fetchNextPage() : refetch()), wait);
    return () => clearTimeout(timer);
  }, [error, enabled, isFetching, isFetchNextPageError, fetchNextPage, refetch]);

  // Hold newly landed pages back while auto-paging, publishing them together; a held view only
  // stands in for the same query (same first page), and errors or the last page show everything.
  const holdBack = auto && enabled && hasNextPage && !isFetchNextPageError;
  const [shown, setShown] = useState(data);
  const shownAt = useRef(0);
  const visible = holdBack && shown && data && shown.pages[0] === data.pages[0] ? shown : data;
  useEffect(() => {
    if (!holdBack || shown === data) return;
    const timer = setTimeout(() => {
      shownAt.current = Date.now();
      setShown(data);
    }, Math.max(0, shownAt.current + COMMIT_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [holdBack, data, shown]);

  // appends each new page instead of re-walking them all (getId is expected to be stable)
  const [cached] = useState(() => ({ getId, flatten: createPageFlattener(getId) }));
  const items = useMemo<T[]>(
    () => (cached.getId === getId ? cached.flatten : createPageFlattener(getId))(visible?.pages),
    [cached, visible, getId],
  );

  const errored = (isError || isFetchNextPageError) && !rateLimited;
  return {
    items,
    loadedCount: items.length,
    // drop the loading state on error so the pill hides instead of hanging on (hasNextPage stays true
    // after a failed page); callers surface isError separately. In auto mode hasNextPage counts as
    // "still paging" (more is coming); in on-demand mode only an in-flight fetch does.
    isPaging: (isFetching || (auto && hasNextPage) || rateLimited) && !errored,
    isError: errored,
    isLoading: isLoading || (rateLimited && data === undefined),
    hasMore: hasNextPage && !errored,
    loadMore,
    // the shown first page, for what a page says about the whole list (e.g. the order it is in)
    firstPage: visible?.pages[0],
  };
}
