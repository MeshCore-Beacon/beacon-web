import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { RegionProvider, useRegion, useRegionSelection } from "./hooks/useRegion";
import {
  ALL_REGIONS,
  isAllRegions,
  parseSelection,
  selectionToParams,
  resolveIatas,
  deserializeSelection,
  type RegionSelection,
} from "./hooks/region-selection";
import { ThemeProvider } from "./hooks/useTheme";
import { useIsMobile } from "./hooks/useMediaQuery";
import { useFeatures, useFeaturesLoading } from "./hooks/useFeatures";
import { useView, VIEW_PARAMS } from "./features/account/useView";
import { usePauseWhenHidden } from "./hooks/usePauseWhenHidden";
import { AppShell } from "./components/AppShell";
import { SplashScreen } from "./components/SplashScreen";
import { VersionGate } from "./components/VersionGate";
import { PacketList } from "./features/packets/PacketList";
import { PacketAnalyzerDrawer } from "./features/packets/PacketAnalyzerDrawer";
import { NodeTable } from "./features/nodes/NodeTable";
import { NodeDetailPanel, type NodeView } from "./features/nodes/NodeDetailPanel";
import { InvestigationPanel, type Investigation, type InvestigationTarget } from "./features/InvestigationPanels";
import { ObserverPage } from "./features/observers/ObserverPage";
import { observerDestination } from "./features/observers/observer-navigation";
import { fetchObserverNode } from "./features/observers/observer-node";
import { RouteTable } from "./features/routes/RouteTable";
import { TraceList } from "./features/traces/TraceList";
import { ChannelList } from "./features/channels/ChannelList";
import { EmptyState } from "./components/EmptyState";
import { usePacketDetail } from "./features/packets/usePacketDetail";
import { WsManager } from "./api/ws-manager";
import { queryRetryDefaults } from "./api/rate-limit";
import { WS_URL, ENABLED_TABS } from "./lib/constants";
import { prefetchStatsTab } from "./features/stats/prefetch";
import { asStatsRange, asStatsTab } from "./features/stats/stats-url";
import { useStatsRegion } from "./features/stats/useStats";
import type { PacketDetail } from "./types/api";

// Map (maplibre-gl, ~1MB) and Atlas are lazy-loaded so their chunks are fetched on first visit
// instead of bloating the initial bundle.
const AtlasPage = lazy(() => import("./features/atlas/AtlasPage").then(m => ({ default: m.AtlasPage })));
const MapView = lazy(() => import("./features/map/MapView").then((m) => ({ default: m.MapView })));

// Stats pulls in ECharts (~150-200KB gz), so lazy-load it too — the chunk loads on first visit to Stats.
const StatsOverview = lazy(() => import("./features/stats/StatsOverview").then((m) => ({ default: m.StatsOverview })));

// Sign-in, registration, verify and reset views: one chunk, fetched only when one is opened.
const AccountViews = lazy(() => import("./features/account/AccountViews").then((m) => ({ default: m.AccountViews })));

// global singletons

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      ...queryRetryDefaults,
      refetchOnWindowFocus: false,
    },
  },
});

const wsManager = new WsManager(WS_URL);

const WS_EVENTS = ["packetObservation", "channelMessage", "observerStatus", "nodeUpdate"];

// Compute the initial region selection on first load: URL params win (shareable links), then the
// persisted selection, then the pre-multi-select single-IATA key (migrated), else all regions.
function computeInitialSelection(params: URLSearchParams): RegionSelection {
  const fromUrl = parseSelection(params);
  if (!isAllRegions(fromUrl)) return fromUrl;
  const stored = deserializeSelection(localStorage.getItem("beacon-region-selection"));
  if (!isAllRegions(stored)) return stored;
  const legacy = localStorage.getItem("beacon-region");
  if (legacy && legacy !== "*") return { regions: [], iatas: [legacy.toUpperCase()] };
  return ALL_REGIONS;
}

// null-render: starts the open Analytics sub-tab's requests alongside its lazy chunk
function AnalyticsPrefetch({ active }: { active: boolean }) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const scope = useStatsRegion();
  const tab = asStatsTab(searchParams.get("statsTab"));
  const range = asStatsRange(searchParams.get("range"));
  // old ?statsTab=observer links are redirected to the Observers tab, not shown
  const redirected = searchParams.get("statsTab") === "observer";
  useEffect(() => {
    if (active && !redirected) prefetchStatsTab(queryClient, tab, range, scope);
  }, [active, redirected, queryClient, tab, range, scope]);
  return null;
}

// Once the first view has had time to load, fetch the lazy tabs' code so a later click doesn't wait
// on it; skipped when the browser asks to save data.
const PRELOAD_DELAY_MS = 3_000;
function usePreloadLazyTabs(accountsOn: boolean) {
  useEffect(() => {
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    let idle: number | undefined;
    const preload = () => {
      if (ENABLED_TABS.includes("Analytics")) void import("./features/stats/StatsOverview");
      if (ENABLED_TABS.includes("Map")) void import("./features/map/MapView");
      if (accountsOn) void import("./features/account/AccountViews");
    };
    const timer = setTimeout(() => {
      if ("requestIdleCallback" in window) idle = requestIdleCallback(preload, { timeout: 5_000 });
      else preload();
    }, PRELOAD_DELAY_MS);
    return () => {
      clearTimeout(timer);
      if (idle !== undefined) cancelIdleCallback(idle);
    };
  }, [accountsOn]);
}

// null-render component -- easiest way to sync region changes into the WS manager

function RegionWatcher({ wsManager: mgr }: { wsManager: WsManager }) {
  const { iatas, regionKey, isResolved } = useRegion();

  useEffect(() => {
    if (isResolved === false) return;
    mgr.updateSubscription({ iatas, events: WS_EVENTS });
    // regionKey is the stable identity of the resolved iatas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mgr, regionKey]);

  return null;
}

// Mirror the active selection into the URL (?regions= / ?iata=) so the address bar is always shareable
// — on a dropdown change and on load (including a selection restored from localStorage, which users
// wouldn't otherwise know was shareable). All-regions clears both params; any legacy ?region is folded
// in. The guard skips redundant writes (and any setSearchParams feedback loop); replace keeps it out of
// history.
function RegionUrlSync() {
  const { selection } = useRegionSelection();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const next = selectionToParams(selection, searchParams);
    if (next.toString() === searchParams.toString()) return;
    // navigate, not setSearchParams: that drops the fragment, which carries a mailed link's token.
    navigate({ search: `?${next}`, hash: location.hash }, { replace: true, state: location.state });
  }, [selection, searchParams, navigate, location.hash, location.state]);

  return null;
}

// Restores a shared "?path" link once its detail arrives. A copied path link carries ?hash without
// ?analyze (PacketPathMapModal's Copy Link strips it), so this can't reuse the analyzer drawer's fetch
// and needs its own — sharing usePacketDetail's query cache means that costs nothing extra when both
// params are present.
export function PathLinkRestore({ initialPath, hash, analyzerDetail, onRestore }: {
  initialPath: string | null;
  hash: string | null;
  analyzerDetail: PacketDetail | undefined;
  onRestore: (detail: PacketDetail, key: string) => void;
}) {
  const { data: pathLinkDetail } = usePacketDetail(initialPath ? hash : null);
  const handledRef = useRef(false);

  useEffect(() => {
    const detail = analyzerDetail?.packetHash.toLowerCase() === hash?.toLowerCase() ? analyzerDetail : pathLinkDetail;
    if (!initialPath || !detail || handledRef.current) return;
    handledRef.current = true;
    onRestore(detail, initialPath);
  }, [initialPath, hash, analyzerDetail, pathLinkDetail, onRestore]);

  return null;
}

// The node panel's own ?view= values; account views share the param.
function panelView(value: string | null): Exclude<NodeView, "node"> | null {
  return value === "observer" || value === "poller" ? value : null;
}

// Drop the shared node/observer selection when the user changes region, so a detail panel doesn't keep
// showing an entity that's no longer in the re-queried map/table. Watches the raw selection rather than
// the resolved regionKey: the async slug→IATA expansion on load bumps regionKey without any user action,
// and that must NOT count as a change or it would wipe a deep-linked ?node/?observer before it renders.
// Comparing the previous selection (vs a first-run flag) also survives StrictMode's double effect invoke.
export function SelectionResetOnRegion({ onRegionChange }: { onRegionChange: () => void }) {
  const { selection } = useRegionSelection();
  const prev = useRef(selection);

  useEffect(() => {
    if (prev.current === selection) return; // initial mount, or a re-render that didn't change the selection
    prev.current = selection;
    onRegionChange();
  }, [selection, onRegionChange]);

  return null;
}

// tab state and region init

function TabLoading({ tab }: { tab: string }) {
  const { t } = useTranslation();
  return <EmptyState title={t(`tabs.${tab}`, { defaultValue: tab })} subtitle={t("common.loading")} />;
}

function ViewLoading() {
  const { t } = useTranslation();
  return <EmptyState title={t("common.loading")} />;
}

function AppInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const features = useFeatures();
  const featuresLoading = useFeaturesLoading();
  usePreloadLazyTabs(features.accounts !== "off");
  // While /info is loading a ?view= holds the content area, so a tab does not flash first; with accounts off it is ignored.
  const { view } = useView();
  const viewOpen = view !== null && (featuresLoading || features.accounts !== "off");
  // The URL is the single source of truth for the active tab — back/forward just work, and an
  // unknown ?tab value falls back to Packets instead of rendering a blank pane.
  // "Stats" was renamed to "Analytics"; keep old ?tab=Stats links working.
  const tabParam = searchParams.get("tab") === "Stats" ? "Analytics" : searchParams.get("tab");
  const activeTab = ENABLED_TABS.includes(tabParam ?? "") ? (tabParam as string) : (ENABLED_TABS.includes("Packets") ? "Packets" : ENABLED_TABS[0] ?? "Packets");
  // Resolve the starting selection once from URL → storage → legacy key (see computeInitialSelection).
  const [initialSelection] = useState(() => computeInitialSelection(searchParams));

  // ?node / ?observer restore a shared deep link on load (see each panel's Copy Link button)
  // ?analyze=1 is a boolean flag; the hash always lives in ?hash, so ?analyze alone opens nothing
  const analyzerHash = searchParams.get("analyze") === "1" ? searchParams.get("hash") : null;
  const [selectedObservationId, setSelectedObservationId] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => searchParams.get("node"));
  const [panels, setPanels] = useState<Investigation[]>([]);
  const scene = JSON.stringify([searchParams.get("hash"), searchParams.get("node"), searchParams.get("analyze")]);
  const [panelScene, setPanelScene] = useState(scene);
  // Moving to another packet or node ends its panels; switching tabs keeps them (desktop).
  if (panelScene !== scene) { setPanelScene(scene); setPanels([]); }
  const openPanel = useCallback((target: InvestigationTarget) => {
    const key = target.kind === "packet" ? `packet:${target.hash.toLowerCase()}:${target.observationId ?? ""}` : target.kind === "path" ? `path:${target.detail.packetHash.toLowerCase()}:${target.selectedKey ?? "all"}` : `${target.kind}:${target.id}`;
    setPanels(previous => {
      const existing = previous.findIndex(panel => panel.key === key);
      return existing < 0 ? [...previous, { key, target }] : previous.slice(0, existing + 1);
    });
  }, [setPanels]);
  const viewNode = useCallback((id: string) => openPanel({ kind: "node", id }), [openPanel]);
  const viewNodeOn = useCallback((id: string, view?: NodeView) => openPanel({ kind: "node", id, view }), [openPanel]);
  const viewPacket = useCallback((hash: string, observationId?: number) => openPanel({ kind: "packet", hash, observationId }), [openPanel]);
  const handleViewPath = useCallback((detail: PacketDetail, key?: string) => openPanel({ kind: "path", detail, selectedKey: key }), [openPanel]);
  const [pathLink] = useState(() => ({ path: searchParams.get("path"), hash: searchParams.get("hash") }));
  const { data: analyzerDetail, isLoading: analyzerLoading } = usePacketDetail(analyzerHash);

  const closePanel = (index: number) => {
    setPanels(previous => previous.slice(0, index));
    if (panels[index]?.target.kind === "path" && searchParams.has("path")) setSearchParams(previous => {
      const next = new URLSearchParams(previous); next.delete("path"); return next;
    }, { replace: true });
  };

  const selectObservation = useCallback((id: number | null) => {
    setSelectedObservationId(id);
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (id == null) next.delete("observation"); else next.set("observation", String(id));
      return next;
    }, { replace: true });
  }, [setSearchParams, setSelectedObservationId]);

  const handleAnalyze = useCallback((hash: string | null, observationId?: number) => {
    // No reset: observation ids are globally unique, so a pick inside an expanded row survives into the drawer.
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (hash) { if (n.get("hash") !== hash) n.delete("observation"); n.set("hash", hash); n.set("analyze", "1"); n.delete("path"); if (observationId != null) n.set("observation", String(observationId)); }
      else n.delete("analyze");
      return n;
    }, { replace: true });
  }, [setSearchParams]);

  const handleTabChange = (tab: string, mapFocus?: { lat: number; lng: number }) => {
    // On mobile a detail panel (and the analyzer) fills the screen, so leaving its tab must close it;
    // desktop side panels persist across tabs. Map and Analytics start without carried-over windows.
    if (isMobile || tab === "Map" || tab === "Analytics") setPanels([]);
    if (isMobile) {
      setSelectedObservationId(null);
      setSelectedNodeId(null);
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      // ?view=observer|poller belongs to the docked node panel, which only survives a desktop move between Nodes and Map
      const keepNodeView = !isMobile && (tab === "Nodes" || tab === "Map") ? panelView(prev.get("view")) : null;
      for (const key of VIEW_PARAMS) next.delete(key);
      if (keepNodeView) next.set("view", keepNodeView);
      if (tab !== "Routes") for (const key of ["route", "routeIata"]) next.delete(key);
      // the analyzer is URL-backed, so its mobile close lives here rather than above
      if (isMobile) next.delete("analyze");
      // AppShell fires onTabChange even for a no-op click on the already-active tab — only an actual
      // tab switch should drop the other tab's compare state (compareUntil is shared by both lists).
      const changed = prev.get("tab") !== tab;
      if (changed && tab !== "Observers") for (const key of ["observer", "compareWith", "compareUntil"]) next.delete(key);
      if (changed && tab !== "Analytics") for (const key of ["compareA", "compareB", "compareSince", "compareUntil"]) next.delete(key);
      // lat/lng/zoom only seed the map on mount, so they'd re-frame it on every later visit
      if (tab !== "Map" || mapFocus) for (const key of ["lat", "lng", "zoom"]) next.delete(key);
      if (mapFocus) {
        next.set("lat", mapFocus.lat.toFixed(5));
        next.set("lng", mapFocus.lng.toFixed(5));
        next.set("zoom", "14");
      }
      // stats sub-state shouldn't haunt the URL on other tabs
      if (tab !== "Analytics" && tab !== "Observers") {
        next.delete("statsTab");
        next.delete("observerId");
        next.delete("range");
      }
      return next;
    });
  };

  // offered only off the Map tab, and only when the deployment has one
  const canViewOnMap = activeTab !== "Map" && ENABLED_TABS.includes("Map");
  const handleViewOnMap = (nodeId: string, lat: number, lng: number) => {
    handleTabChange("Map", { lat, lng });
    if (!isMobile) setSelectedNodeId(nodeId);
  };

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setPanels([]);
  }, [setSelectedNodeId, setPanels]);

  // Closing a detail panel drops its deep-link param so a reload can't reopen it (mirrors the packet
  // analyzer's ?analyze cleanup). Selecting a different node/observer doesn't touch the URL — the panel's
  // Copy Link button rebuilds a fresh link on demand.
  const dropSelectionParam = useCallback((key: "node") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(key);
      if (panelView(next.get("view"))) next.delete("view");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // The docked panel's Node | Observer | Poller choice. It counts only for the node the URL names, so picking another node starts on Node.
  const nodeView: NodeView = (searchParams.get("node") === selectedNodeId ? panelView(searchParams.get("view")) : null) ?? "node";
  const setNodeView = useCallback((view: NodeView) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (view !== "node" && selectedNodeId) { next.set("node", selectedNodeId); next.set("view", view); }
      else if (panelView(next.get("view"))) next.delete("view");
      return next;
    }, { replace: true });
  }, [setSearchParams, selectedNodeId]);

  const handleCloseNode = useCallback(() => {
    setSelectedNodeId(null);
    dropSelectionParam("node");
  }, [dropSelectionParam, setSelectedNodeId]);

  // An observer opens its dashboard; a packet it was inspected from moves into the side drawer beside it.
  const openObserverDashboard = useCallback((id: string, packet?: { hash: string; observationId?: number }) => {
    setPanels([]);
    const origin = new URLSearchParams(searchParams);
    if (packet) {
      origin.set("hash", packet.hash); origin.set("analyze", "1"); origin.delete("path");
      if (packet.observationId != null) origin.set("observation", String(packet.observationId)); else origin.delete("observation");
    }
    const next = observerDestination(origin, id);
    if (isMobile) {
      // The dashboard covers the screen on mobile, so its Close steps back to the packet instead.
      if (packet) navigate({ search: "?" + origin.toString() }, { replace: true });
      next.delete("analyze");
    }
    navigate({ search: "?" + next.toString() }, { state: { inspected: isMobile } });
  }, [navigate, searchParams, setPanels, isMobile]);

  // An observer that is also a node opens the merged node panel on its Observer view, over whatever is open.
  const viewObserver = useCallback((id: string, packet?: { hash: string; observationId?: number }) => {
    fetchObserverNode(queryClient, id).then(
      (node) => { if (node) openPanel({ kind: "node", id: node.id, view: "observer" }); else openObserverDashboard(id, packet); },
      () => openObserverDashboard(id, packet),
    );
  }, [queryClient, openPanel, openObserverDashboard]);

  useEffect(() => {
    // Region slugs can't be expanded until region details load, so hold the subscription (an empty
    // list subscribes to nothing) and let RegionWatcher subscribe once useRegion resolves them.
    const iatas = initialSelection.regions.length > 0 ? [] : resolveIatas(initialSelection, new Map());
    wsManager.connect({ iatas, events: WS_EVENTS });
    return () => wsManager.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  usePauseWhenHidden(wsManager);

  const tabContent: Record<string, React.ReactNode> = {
    Atlas: <AtlasPage onViewNode={viewNodeOn} onViewObserver={openObserverDashboard} onAnalyzePacket={viewPacket} />,
    Packets: (
      <PacketList
        wsManager={wsManager}
        onAnalyze={handleAnalyze}
        onViewPath={handleViewPath}
        selectedObservationId={selectedObservationId}
        onSelectObservation={setSelectedObservationId}
      />
    ),
    Nodes: <NodeTable wsManager={wsManager} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />,
    Observers: <ObserverPage wsManager={wsManager} onAnalyzePacket={handleAnalyze} onViewNode={viewNode} />,
    Routes: <RouteTable onAnalyzePacket={viewPacket} onViewObserver={viewObserver} onViewNode={viewNode} />,
    // analyze opens the packet overlay (modal) rather than the side drawer, which suits the
    // master/detail layout and renders on any tab — same path NodeDetailPanel's onAnalyzePacket uses
    Traces: <TraceList onAnalyze={hash => { if (hash) viewPacket(hash); }} onViewNode={viewNode} />,
    Channels: <ChannelList wsManager={wsManager} onAnalyze={handleAnalyze} />,
    Analytics: <StatsOverview onViewNode={viewNode} />,
    Map: <MapView wsManager={wsManager} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />,
  };

  return (
    <RegionProvider defaultSelection={initialSelection}>
      <RegionWatcher wsManager={wsManager} />
      <AnalyticsPrefetch active={activeTab === "Analytics"} />
      <Routes><Route path="*" element={<RegionUrlSync />} /></Routes>
      <SelectionResetOnRegion onRegionChange={clearSelection} />
      <PathLinkRestore
        initialPath={pathLink.path}
        hash={pathLink.hash}
        analyzerDetail={analyzerDetail}
        onRestore={handleViewPath}
      />
      <AppShell activeTab={activeTab} onTabChange={handleTabChange} wsManager={wsManager}>
        <div className="relative flex flex-1 min-h-0 min-w-0">
          <div key={viewOpen ? "view" : activeTab} className="flex flex-1 min-h-0 min-w-0 fade-in">
            <Suspense fallback={viewOpen ? <ViewLoading /> : <TabLoading tab={activeTab} />}>
              {viewOpen ? <AccountViews /> : tabContent[activeTab]}
            </Suspense>
          </div>
          {!viewOpen && analyzerHash && activeTab !== "Map" && activeTab !== "Analytics" && (
            <PacketAnalyzerDrawer
              detail={analyzerDetail}
              loading={analyzerLoading}
              selectedObservationId={selectedObservationId}
              onSelectObservation={selectObservation}
              onClose={() => handleAnalyze(null)}
              onViewNode={viewNode}
              onViewObserver={(id, observationId) => viewObserver(id, { hash: analyzerHash!, observationId: observationId ?? selectedObservationId ?? undefined })}
              onViewPath={(key) => { if (analyzerDetail) handleViewPath(analyzerDetail, key); }}
            />
          )}
          {!viewOpen && (activeTab === "Map" || activeTab === "Nodes") && selectedNodeId && (
            <NodeDetailPanel
              nodeId={selectedNodeId}
              onClose={handleCloseNode}
              onViewObserver={viewObserver}
              onOpenObserverDashboard={openObserverDashboard}
              view={nodeView}
              onViewChange={setNodeView}
              onViewNode={setSelectedNodeId}
              onAnalyzePacket={viewPacket}
              onViewOnMap={canViewOnMap ? (lat, lng) => handleViewOnMap(selectedNodeId, lat, lng) : undefined}
            />
          )}
          {!viewOpen && panels.map((panel, index) => <InvestigationPanel key={panel.key} target={panel.target} inactive={index !== panels.length - 1} onClose={() => closePanel(index)} onOpen={openPanel} onViewObserver={viewObserver} onOpenObserverDashboard={openObserverDashboard} onViewOnMap={canViewOnMap ? handleViewOnMap : undefined} />)}
        </div>
      </AppShell>
    </RegionProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SplashScreen />
          <VersionGate />
          <AppInner />
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
