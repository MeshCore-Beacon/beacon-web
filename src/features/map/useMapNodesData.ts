import { useInfinitePages } from "../../hooks/useInfinitePages";
import { getNodesPage } from "../../api/client";
import type { NodeSummary } from "../nodes/types";

const nodeId = (n: NodeSummary) => n.id;

// Page the selected region's nodes 50 at a time for the map, so the canvas fills batch by batch
// instead of waiting for one big response. Thin wrapper over the shared useInfinitePages (which owns
// the auto-chain, dedup, and error handling). Loads once per region; WS updates keep nodes live.
export function useMapNodesData(selectedIatas: string[] | undefined, regionKey: string) {
  const { items, loadedCount, isPaging, isError } = useInfinitePages<NodeSummary>({
    queryKey: ["map-nodes", regionKey],
    queryFn: (cursor) => getNodesPage(selectedIatas, { cursor }),
    getId: nodeId,
  });
  return { nodes: items, loadedCount, isPaging, isError };
}
