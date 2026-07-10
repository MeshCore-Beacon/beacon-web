import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapLibre } from "./useMapLibre";
import { useMapNodes } from "./useMapNodes";
import { useMapNeighbors } from "./useMapNeighbors";
import { useMapPacketFlow } from "./useMapPacketFlow";
import { PacketFlowButton } from "./PacketFlowButton";
import { useMapNodesData } from "./useMapNodesData";
import { nodesToFeatureCollection, filterByNodeType, buildNeighborEdges, buildFocusedNeighborEdges, neighborFocusIds, type NeighborEdgeProps } from "./node-geojson";
import { MapSettingsPanel } from "./MapSettingsPanel";
import { MAP_STYLE_STORAGE_KEY, DEFAULT_STYLE_ID, resolveMapStyle, MAP_NEIGHBOR_LINES_STORAGE_KEY, MAP_CLUSTER_STORAGE_KEY, MAP_NODE_TYPE_STORAGE_KEY, type NeighborLinesMode } from "./types";
import type { FeatureCollection, LineString } from "geojson";
import { EmptyState } from "../../components/EmptyState";
import { LoadingPill } from "../../components/LoadingPill";
import { useRegion } from "../../hooks/useRegion";
import { useTheme } from "../../hooks/useTheme";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { getIatas, getNodeNeighbors } from "../../api/client";
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

  const [typeFilter, setTypeFilter] = useState(() => localStorage.getItem(MAP_NODE_TYPE_STORAGE_KEY) ?? ""); // "" = All
  const handleTypeChange = useCallback((t: string) => {
    setTypeFilter(t);
    localStorage.setItem(MAP_NODE_TYPE_STORAGE_KEY, t);
  }, []);

  const [clustered, setClustered] = useState(() => localStorage.getItem(MAP_CLUSTER_STORAGE_KEY) !== "off");
  const handleClusteredChange = useCallback((c: boolean) => {
    setClustered(c);
    localStorage.setItem(MAP_CLUSTER_STORAGE_KEY, c ? "on" : "off");
  }, []);

  const [neighborLines, setNeighborLines] = useState<NeighborLinesMode>(() => {
    const stored = localStorage.getItem(MAP_NEIGHBOR_LINES_STORAGE_KEY);
    return stored === "on" || stored === "selected" || stored === "off" ? stored : "selected";
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

  // Selected mode colours the one node's edges by observation count + freshness, which only the node
  // detail endpoint carries (the list's neighborIds are bare uuids). Shares the panel's query cache
  // (same key), so selecting a node — which opens the panel — usually has this already warm.
  const { data: focusNeighbors } = useQuery({
    queryKey: ["node-neighbors", selectedNodeId],
    queryFn: () => getNodeNeighbors(selectedNodeId!),
    enabled: neighborLines === "selected" && !!selectedNodeId,
    staleTime: 30_000,
  });

  // "on" is a pure client-side render over already-loaded nodes (neighborIds ship with every map
  // page) so it never refetches; "selected" colours the detail edges; "off" short-circuits to none.
  const neighborEdges = useMemo(() => {
    if (neighborLines === "off") return EMPTY_EDGES;
    if (neighborLines === "selected") {
      if (!selectedNodeId) return EMPTY_EDGES;
      return buildFocusedNeighborEdges(nodes.find((n) => n.id === selectedNodeId), focusNeighbors ?? []);
    }
    return buildNeighborEdges(nodes, "on", selectedNodeId);
  }, [nodes, neighborLines, selectedNodeId, focusNeighbors]);

  // With neighbors shown and a node selected, fade every other node (like live mode) to spotlight
  // the selection and its neighbors. null when there's nothing to focus, so the map stays full-bright.
  const focusIds = useMemo(
    () => (neighborLines === "off" ? null : neighborFocusIds(nodes, selectedNodeId)),
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

  useMapNodes(mapRef, isReady, geojson, isDark, themeKey, clustered, onSelectNode, selectedNodeId, packetFlow, focusIds, `${regionKey}:${typeFilter}`);
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
        onTypeChange={handleTypeChange}
        clustered={clustered}
        onClusteredChange={handleClusteredChange}
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
