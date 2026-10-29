import type { InfiniteData } from "@tanstack/react-query";
import type { NodeSummary } from "./types";
import type { CursorPage } from "../../types/api";
import type { WsNodeUpdate } from "../../types/ws";

// Patch a node's name/lat/lng in a cached list (immutably); nodes not already in the list are left
// alone — the Nodes table can't blindly insert because its cache is filter-scoped. The map uses
// upsertNodePages below instead, which does insert. Shared so the two stay in step.
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
  const lat = data.lat === undefined ? prev.lat : data.lat;
  const lng = data.lng === undefined ? prev.lng : data.lng;
  const possiblyForeign = data.possiblyForeign === undefined ? prev.possiblyForeign : data.possiblyForeign ?? undefined;
  // a re-advert that re-sends the same values must keep the SAME ref so the page patch no-ops
  // (otherwise an unchanged node would trigger a full map FeatureCollection rebuild + setData)
  if (name === prev.name && lat === prev.lat && lng === prev.lng && possiblyForeign === prev.possiblyForeign) return list;
  const updated = [...list];
  updated[idx] = { ...prev, name, lat, lng, possiblyForeign };
  return updated;
}

// each page's node ids, built once per page object: a live update then touches only the page that
// holds its node instead of scanning every loaded node
const pageIds = new WeakMap<CursorPage<NodeSummary>, Set<string>>();
function idsOf(page: CursorPage<NodeSummary>): Set<string> {
  let ids = pageIds.get(page);
  if (!ids) {
    ids = new Set(page.items.map((n) => n.id));
    pageIds.set(page, ids);
  }
  return ids;
}

// patchNodeSummary across a paged cache; same result as patching every page, unchanged pages and an
// unchanged cache keep their references
export function patchNodePages(
  old: InfiniteData<CursorPage<NodeSummary>> | undefined,
  data: WsNodeUpdate["data"],
): InfiniteData<CursorPage<NodeSummary>> | undefined {
  if (!old) return old;
  let pages: CursorPage<NodeSummary>[] | undefined;
  old.pages.forEach((page, i) => {
    if (!idsOf(page).has(data.nodeId)) return;
    const items = patchNodeSummary(page.items, data);
    if (!items || items === page.items) return;
    pages ??= [...old.pages];
    pages[i] = { ...page, items };
  });
  return pages ? { ...old, pages } : old;
}

// Patch-or-insert for the map's unfiltered node cache. A nodeUpdate event carries a full summary,
// so a node we've never fetched can join the map live instead of waiting for a reload (the cache
// never refetches on its own — staleTime is Infinity).
export function upsertNodePages(
  old: InfiniteData<CursorPage<NodeSummary>> | undefined,
  data: WsNodeUpdate["data"],
): InfiniteData<CursorPage<NodeSummary>> | undefined {
  if (!old || old.pages.length === 0) return old;
  if (old.pages.some((p) => idsOf(p).has(data.nodeId))) return patchNodePages(old, data);
  const fresh: NodeSummary = {
    id: data.nodeId,
    publicKey: data.publicKey,
    nodeType: data.nodeType,
    nodeTypeName: data.nodeTypeName,
    name: data.name || null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    radio: data.radio,
    defaultScope: data.defaultScope,
    iatas: data.iatas,
    // the nodeUpdate event rides on an advert and doesn't carry a neighbor count; a node we're
    // meeting for the first time has none resolved yet, so start at 0 until a reload fills it in
    knownNeighborCount: 0,
    isObserver: data.isObserver,
    possiblyForeign: data.possiblyForeign ?? undefined,
  };
  const pages = [...old.pages];
  const last = pages[pages.length - 1]!;
  pages[pages.length - 1] = { ...last, items: [...last.items, fresh] };
  return { ...old, pages };
}
