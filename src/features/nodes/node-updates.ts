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
  const prev = list[idx]!;
  // only name/coords move in practice; nodeType/iatas are near-static, so we drop data.nodeType here
  // and let a reload carry a rare type change rather than keep a numeric-type lookup in sync
  const name = data.name || prev.name;
  const lat = data.lat ?? prev.lat;
  const lng = data.lng ?? prev.lng;
  // a re-advert that re-sends the same values must keep the SAME ref so patchInfinitePages no-ops
  // (otherwise an unchanged node would trigger a full map FeatureCollection rebuild + setData)
  if (name === prev.name && lat === prev.lat && lng === prev.lng) return list;
  const updated = [...list];
  updated[idx] = { ...prev, name, lat, lng };
  return updated;
}
