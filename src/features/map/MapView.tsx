import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapLibre } from "./useMapLibre";
import { useMapNodes } from "./useMapNodes";
import { useMapNodesData } from "./useMapNodesData";
import { nodesToFeatureCollection, filterByNodeType } from "./node-geojson";
import { MapSettingsPanel } from "./MapSettingsPanel";
import { MAP_STYLE_STORAGE_KEY, DEFAULT_STYLE_ID, resolveMapStyle } from "./types";
import { EmptyState } from "../../components/EmptyState";
import { useRegion, useRegionSelection, useRegions } from "../../hooks/useRegion";
import { useTheme } from "../../hooks/useTheme";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { getIatas } from "../../api/client";
import { patchNodeSummary } from "../nodes/node-updates";
import type { WsManager } from "../../api/ws-manager";
import type { NodeSummary } from "../nodes/types";
import type { CursorPage } from "../../types/api";
import type { WsNodeUpdate } from "../../types/ws";

interface MapViewProps {
  wsManager: WsManager;
  // shared with the Nodes tab (lifted to AppInner) so the open NodeDetailPanel stays live
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

export function MapView({ wsManager, selectedNodeId, onSelectNode }: MapViewProps) {
  // restore the saved style; resolveMapStyle falls back to the default if the stored id is stale
  const [styleId, setStyleId] = useState(
    () => resolveMapStyle(localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID).id,
  );

  const handleStyleChange = useCallback((id: string) => {
    setStyleId(id);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, id);
  }, []);

  // A basemap that fails to load (offline / 5xx) reverts the selection to the last style that loaded,
  // so the switcher matches the still-rendered map and the failed choice isn't persisted.
  const handleStyleError = useCallback((lastGoodStyleId: string) => {
    setStyleId(lastGoodStyleId);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, lastGoodStyleId);
  }, []);

  const [typeFilter, setTypeFilter] = useState(""); // "" = All
  const [clustered, setClustered] = useState(true);

  const { iatas: selectedIatas, regionKey } = useRegion();
  const { selection } = useRegionSelection();
  const { bySlug } = useRegions();
  const queryClient = useQueryClient();
  // marker/cluster icons are canvas-drawn from the active --palette-* vars, so useMapNodes has to
  // re-register them whenever the palette changes: on a theme switch, and once on load when the async
  // themes populate (from [] -> filled).
  const { themeId, themes } = useTheme();
  const themeKey = themes.length ? themeId : "";
  const { data: iatas } = useQuery({ queryKey: ["iatas"], queryFn: getIatas, staleTime: 60_000 });

  // nodes for the selected region (its own key, independent of the Nodes-table filters/page cap).
  // Pages in 50 at a time so the map fills batch by batch; nodesKey matches the hook's query key.
  const nodesKey = useMemo(() => ["map-nodes", regionKey], [regionKey]);
  const { nodes, loadedCount, isPaging, isError: nodesError } = useMapNodesData(selectedIatas, regionKey);

  // patch the live update into the paged node cache (reusing the shared helper per page); the memo +
  // setData reflect it. The cache is InfiniteData now, not a flat list. Keep page/object references
  // when nothing changed so an update for a node we don't hold doesn't trigger a full map repaint.
  const handleNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      queryClient.setQueryData<InfiniteData<CursorPage<NodeSummary>>>(nodesKey, (old) => {
        if (!old) return old;
        let changed = false;
        const pages = old.pages.map((p) => {
          const items = patchNodeSummary(p.items, data) ?? p.items;
          if (items === p.items) return p; // unchanged page keeps its reference
          changed = true;
          return { ...p, items };
        });
        return changed ? { ...old, pages } : old;
      });
      // mirror NodeTable: refresh the shared detail panel when the open node changes live
      if (selectedNodeId === data.nodeId) {
        queryClient.invalidateQueries({ queryKey: ["node", data.nodeId] });
      }
    },
    [queryClient, nodesKey, selectedNodeId],
  );
  useWsNodeUpdateHandler(wsManager, handleNodeUpdate);

  // split memos: rebuild the FeatureCollection only when nodes change; a type-filter change just
  // re-filters the already-built collection instead of re-running the full transform over all nodes
  const baseFc = useMemo(() => nodesToFeatureCollection(nodes), [nodes]);
  const geojson = useMemo(() => filterByNodeType(baseFc, typeFilter), [baseFc, typeFilter]);

  // focus the map when the selection narrows to one place: a single region uses its configured center,
  // a single IATA centers on that airport. A multi-selection (or all regions) leaves the view as-is.
  const focus = useMemo<[number, number] | null>(() => {
    if (selection.regions.length === 1 && selection.iatas.length === 0) {
      const r = bySlug.get(selection.regions[0]!);
      if (r?.centerLat != null && r?.centerLng != null) return [r.centerLng, r.centerLat];
    }
    if (selection.iatas.length === 1 && selection.regions.length === 0) {
      const match = iatas?.find((i) => i.iata === selection.iatas[0]);
      if (match && match.lat != null && match.lon != null) return [match.lon, match.lat];
    }
    return null;
  }, [selection, bySlug, iatas]);

  const { containerRef, mapRef, isReady, error } = useMapLibre(styleId, focus, handleStyleError);
  const isDark = resolveMapStyle(styleId).dark; // drives marker theming + maplibre control chrome

  useMapNodes(mapRef, isReady, geojson, isDark, themeKey, clustered, onSelectNode, selectedNodeId);

  return (
    <div className="relative flex flex-1 min-h-0">
      {/* Fill via flex-1, NOT absolute inset-0: maplibre adds .maplibregl-map { position: relative }
          to this element, which overrides Tailwind's `absolute` and would collapse inset-0 to 0
          height. data-dark drives the maplibre control theming in index.css. */}
      <div ref={containerRef} data-dark={isDark} className="flex-1" />
      <MapSettingsPanel
        styleId={styleId}
        onStyleChange={handleStyleChange}
        typeFilter={typeFilter}
        onTypeChange={setTypeFilter}
        clustered={clustered}
        onClusteredChange={setClustered}
      />
      {isPaging ? (
        // streams in 50 at a time; the count climbs as pages land, then the pill disappears
        <div
          role="status"
          className="absolute bottom-3 left-3 z-10 flex items-center gap-2 px-2.5 py-1 bg-bg-surface border border-border-subtle rounded-md font-mono text-[11px] text-text-muted shadow-lg"
        >
          <span className="size-1.5 rounded-full bg-primary animate-pulse" aria-hidden />
          Loading nodes… ({loadedCount})
        </div>
      ) : nodesError ? (
        // a page fetch failed: surface it instead of a silently-empty (or partial) map
        <div
          role="status"
          className="absolute bottom-3 left-3 z-10 flex items-center gap-2 px-2.5 py-1 bg-bg-surface border border-border-subtle rounded-md font-mono text-[11px] text-danger shadow-lg"
        >
          <span className="size-1.5 rounded-full bg-danger" aria-hidden />
          {loadedCount > 0 ? `Some nodes failed to load (${loadedCount} shown)` : "Failed to load nodes"}
        </div>
      ) : null}
      {error && (
        // z-20 so the failure overlay covers the settings card (z-10) instead of it floating on top
        <div className="absolute inset-0 z-20 bg-bg-base">
          <EmptyState title="Map failed to load" subtitle="Check your connection and reload" />
        </div>
      )}
    </div>
  );
}
