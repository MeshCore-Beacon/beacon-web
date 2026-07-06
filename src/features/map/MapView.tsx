import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapLibre } from "./useMapLibre";
import { useMapNodes } from "./useMapNodes";
import { useMapNeighbors } from "./useMapNeighbors";
import { useMapPacketFlow } from "./useMapPacketFlow";
import { PacketFlowButton } from "./PacketFlowButton";
import { useMapNodesData } from "./useMapNodesData";
import { nodesToFeatureCollection, filterByNodeType, buildNeighborEdges, type NeighborEdgeProps } from "./node-geojson";
import { MapSettingsPanel } from "./MapSettingsPanel";
import { MAP_STYLE_STORAGE_KEY, DEFAULT_STYLE_ID, resolveMapStyle, MAP_NEIGHBOR_LINES_STORAGE_KEY, type NeighborLinesMode } from "./types";
import type { FeatureCollection, LineString } from "geojson";
import { EmptyState } from "../../components/EmptyState";
import { LoadingPill } from "../../components/LoadingPill";
import { useRegion } from "../../hooks/useRegion";
import { useTheme } from "../../hooks/useTheme";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { getIatas } from "../../api/client";
import { upsertNodePages } from "../nodes/node-updates";
import type { WsManager } from "../../api/ws-manager";
import type { NodeSummary } from "../nodes/types";
import type { CursorPage } from "../../types/api";
import type { WsNodeUpdate } from "../../types/ws";

const EMPTY_EDGES: FeatureCollection<LineString, NeighborEdgeProps> = { type: "FeatureCollection", features: [] };

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

  const [neighborLines, setNeighborLines] = useState<NeighborLinesMode>(() => {
    const stored = localStorage.getItem(MAP_NEIGHBOR_LINES_STORAGE_KEY);
    return stored === "on" || stored === "selected" ? stored : "off";
  });
  const handleNeighborLinesChange = useCallback((mode: NeighborLinesMode) => {
    setNeighborLines(mode);
    localStorage.setItem(MAP_NEIGHBOR_LINES_STORAGE_KEY, mode);
  }, []);

  // live packet-flow animation: opt-in per session (off by default, not persisted)
  const [packetFlow, setPacketFlow] = useState(false);

  const { iatas: selectedIatas, regionKey } = useRegion();
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

  // patch-or-insert the live update into the paged node cache (the shared helper preserves refs
  // when nothing changed, so a same-values re-advert doesn't trigger a full map repaint); brand-new
  // nodes are appended from the event itself since the cache never refetches on its own.
  const handleNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      queryClient.setQueryData<InfiniteData<CursorPage<NodeSummary>>>(nodesKey, (old) =>
        upsertNodePages(old, data),
      );
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

  // Neighbor edges are a pure client-side render over already-loaded nodes (neighborIds ship with
  // every map page), so toggling On/Selected/Off never refetches. "off" short-circuits to no edges.
  const neighborEdges = useMemo(
    () => (neighborLines === "off" ? EMPTY_EDGES : buildNeighborEdges(nodes, neighborLines, selectedNodeId)),
    [nodes, neighborLines, selectedNodeId],
  );

  // IATA coords to frame: the selection's airports, or every airport for "All". Regions carry no
  // bounds from the API, so their member IATAs stand in for the extent. See CLAUDE.md (map framing).
  const fitPoints = useMemo<[number, number][] | null>(() => {
    const withCoords = (iatas ?? []).filter((i) => i.lat != null && i.lon != null);
    if (withCoords.length === 0) return null;
    const scope = selectedIatas && selectedIatas.length > 0 ? new Set(selectedIatas) : null;
    const chosen = scope ? withCoords.filter((i) => scope.has(i.iata)) : withCoords;
    return chosen.length > 0 ? chosen.map((i) => [i.lon!, i.lat!]) : null;
  }, [iatas, selectedIatas]);

  const { containerRef, mapRef, isReady, error } = useMapLibre(styleId, fitPoints, handleStyleError);
  const isDark = resolveMapStyle(styleId).dark; // drives marker theming + maplibre control chrome

  useMapNodes(mapRef, isReady, geojson, isDark, themeKey, clustered, onSelectNode, selectedNodeId, `${regionKey}:${typeFilter}`);
  useMapNeighbors(mapRef, isReady, neighborEdges, themeKey);
  useMapPacketFlow(mapRef, isReady, packetFlow, wsManager, themeKey, regionKey);

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
        neighborLines={neighborLines}
        onNeighborLinesChange={handleNeighborLinesChange}
      />
      <PacketFlowButton active={packetFlow} onToggle={() => setPacketFlow((v) => !v)} />
      {/* streams in 50 at a time; the count climbs as pages land, then the pill disappears */}
      <LoadingPill loading={isPaging} error={nodesError} count={loadedCount} noun="nodes" />
      {error && (
        // z-20 so the failure overlay covers the settings card (z-10) instead of it floating on top
        <div className="absolute inset-0 z-20 bg-bg-base">
          <EmptyState title="Map failed to load" subtitle="Check your connection and reload" />
        </div>
      )}
    </div>
  );
}
