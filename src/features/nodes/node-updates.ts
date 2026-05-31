import type { NodeSummary } from "./types";
import type { WsNodeUpdate } from "../../types/ws";

// Patch a node's name/lat/lng in a cached list (immutably); nodes not already in the list are left
// for the periodic refetch to pick up. Shared by the Nodes-table and Map caches so the two stay in
// step.
export function patchNodeSummary(
  list: NodeSummary[] | undefined,
  data: WsNodeUpdate["data"],
): NodeSummary[] | undefined {
  if (!list) return list;
  const idx = list.findIndex((n) => n.id === data.nodeId);
  if (idx === -1) return list;
  const updated = [...list];
  const prev = updated[idx]!;
  // only name/coords move in practice; nodeType/iatas are near-static, so we drop data.nodeType here
  // and let the 30s refetch carry a rare type change rather than keep a numeric-type lookup in sync
  updated[idx] = {
    ...prev,
    name: data.name || prev.name,
    lat: data.lat ?? prev.lat,
    lng: data.lng ?? prev.lng,
  };
  return updated;
}
