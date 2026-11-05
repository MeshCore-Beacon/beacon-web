import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { getNodesPage } from "../../api/client";
import { NODE_REGION_PAGE_SIZE } from "../../lib/constants";
import type { NodeSummary } from "../nodes/types";

const nodeId = (n: NodeSummary) => n.id;

// Page the selected region's nodes in big batches for the map, so the canvas fills batch by batch
// instead of waiting for one big response. Thin wrapper over the shared useInfinitePages (which owns
// the auto-chain, dedup, and error handling). WS updates keep nodes live; enabled scope evidence refreshes once per minute.
export function useMapNodesData(selectedIatas: string[] | undefined, regionKey: string, opts?: { enabled?: boolean; refreshScopes?: boolean }) {
  const queryClient = useQueryClient();
  const refreshScopes = !!opts?.refreshScopes;
  const enabled = opts?.enabled !== false;
  const { items, loadedCount, isPaging, isError } = useInfinitePages<NodeSummary>({
    queryKey: ["map-nodes", regionKey],
    // Always request neighborIds (just UUIDs) so the neighbor-lines toggle is a pure client-side
    // render switch over already-loaded data — no refetch when toggling.
    queryFn: (page) => getNodesPage(selectedIatas, { cursor: page?.cursor, pageCursor: page?.pageCursor, neighbors: true, limit: NODE_REGION_PAGE_SIZE }),
    getId: nodeId,
    enabled: opts?.enabled,
    refetchInterval: opts?.refreshScopes ? 60_000 : false,
  });
  useEffect(() => {
    if (enabled && refreshScopes) {
      void queryClient.invalidateQueries({ queryKey: ["map-nodes", regionKey], refetchType: "active" }, { cancelRefetch: false });
    }
  }, [queryClient, regionKey, enabled, refreshScopes]);
  return { nodes: items, loadedCount, isPaging, isError };
}
