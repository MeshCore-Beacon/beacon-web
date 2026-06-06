import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getNodesPage } from "../../api/client";
import type { NodeSummary } from "../nodes/types";

// Page the selected region's nodes 50 at a time and surface the set as it grows, so the map can
// drop each batch onto the canvas instead of waiting for one big response. Loads once per region
// (staleTime Infinity, no refetchInterval); live freshness comes from the WS node-update handler.
export function useMapNodesData(selectedIatas: string[] | undefined, regionKey: string) {
  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isError, isFetchNextPageError } =
    useInfiniteQuery({
      queryKey: ["map-nodes", regionKey],
      queryFn: ({ pageParam }) => getNodesPage(selectedIatas, { cursor: pageParam }),
      // nextCursor alone drives paging (the backend keeps hasMore in sync with it); mirrors usePackets.
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      initialPageParam: undefined as number | undefined,
      staleTime: Infinity,
      // no maxPages cap: a region's full set can run well past the packet list's 20-page limit
    });

  // Chain to the next page as soon as the current one settles — this is what makes nodes stream in
  // batch by batch rather than all at once. Bail on a page error: a failed fetchNextPage adds no
  // page, so hasNextPage stays true while isFetchingNextPage drops to false — without the error
  // guard the effect would re-fire and retry the failing page forever.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  // Dedupe by id: the cursor is lastSeen (a timestamp, not unique), so nodes sharing a timestamp at
  // a page boundary can repeat across pages. Mirror usePackets' dedup so the map can't draw a node
  // twice (double markers, inflated count).
  const nodes = useMemo<NodeSummary[]>(() => {
    const seen = new Set<string>();
    return (data?.pages.flatMap((p) => p.items) ?? []).filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }, [data]);

  const errored = isError || isFetchNextPageError;
  return {
    nodes,
    loadedCount: nodes.length,
    // drop the loading state on error so the pill hides instead of hanging on (hasNextPage stays
    // true after a failed page); MapView surfaces isError separately.
    isPaging: (isFetching || hasNextPage) && !errored,
    isError: errored,
  };
}
