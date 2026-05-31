import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapLibre } from "./useMapLibre";
import { useMapNodes } from "./useMapNodes";
import { nodesToFeatureCollection, filterByNodeType } from "./node-geojson";
import { MapSettingsPanel } from "./MapSettingsPanel";
import {
  MAP_STYLE_STORAGE_KEY,
  DEFAULT_STYLE_ID,
  MAP_NODES_LIMIT,
  resolveMapStyle,
} from "./types";
import { EmptyState } from "../../components/EmptyState";
import { useRegion } from "../../hooks/useRegion";
import { useTheme } from "../../hooks/useTheme";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { getIatas, getNodes } from "../../api/client";
import { patchNodeSummary } from "../nodes/node-updates";
import type { WsManager } from "../../api/ws-manager";
import type { NodeSummary } from "../nodes/types";
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

  const region = useRegion();
  const queryClient = useQueryClient();
  // marker/cluster icons are canvas-drawn from the active --palette-* vars, so useMapNodes has to
  // re-register them whenever the palette changes: on a theme switch, and once on load when the async
  // themes populate (from [] -> filled).
  const { themeId, themes } = useTheme();
  const themeKey = themes.length ? themeId : "";
  const { data: iatas } = useQuery({ queryKey: ["iatas"], queryFn: getIatas, staleTime: 60_000 });

  // nodes for the selected region (its own key, independent of the Nodes-table filters/page cap)
  const nodesKey = useMemo(() => ["map-nodes", region], [region]);
  const { data: nodes } = useQuery({
    queryKey: nodesKey,
    queryFn: () => getNodes({ iata: region === "*" ? undefined : region, limit: MAP_NODES_LIMIT }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // patch the live update into the cached node (shared helper with NodeTable); the memo + setData reflect it
  const handleNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      queryClient.setQueryData<NodeSummary[]>(nodesKey, (old) => patchNodeSummary(old, data));
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
  const baseFc = useMemo(() => nodesToFeatureCollection(nodes ?? []), [nodes]);
  const geojson = useMemo(() => filterByNodeType(baseFc, typeFilter), [baseFc, typeFilter]);

  // focus the map on the selected region when the API provides its coordinates ("*" = all regions)
  const focus = useMemo<[number, number] | null>(() => {
    if (region === "*") return null;
    const match = iatas?.find((i) => i.iata === region);
    return match && match.lat != null && match.lon != null ? [match.lon, match.lat] : null;
  }, [region, iatas]);

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
      {error && (
        // z-20 so the failure overlay covers the settings card (z-10) instead of it floating on top
        <div className="absolute inset-0 z-20 bg-bg-base">
          <EmptyState title="Map failed to load" subtitle="Check your connection and reload" />
        </div>
      )}
    </div>
  );
}
