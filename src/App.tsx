import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { AppShell } from "./components/AppShell";
import { SplashScreen } from "./components/SplashScreen";
import { PacketList } from "./features/packets/PacketList";
import { PacketAnalyzerDrawer } from "./features/packets/PacketAnalyzerDrawer";
import { NodeTable } from "./features/nodes/NodeTable";
import { NodeDetailPanel } from "./features/nodes/NodeDetailPanel";
import { InvestigationPanel, type Investigation, type InvestigationTarget } from "./features/InvestigationPanels";
import { ObserverPage } from "./features/observers/ObserverPage";
import { observerDestination } from "./features/observers/observer-navigation";
import { RouteTable } from "./features/routes/RouteTable";
import { TraceList } from "./features/traces/TraceList";
import { ChannelList } from "./features/channels/ChannelList";
import { EmptyState } from "./components/EmptyState";
import { usePacketDetail } from "./features/packets/usePacketDetail";
import { WsManager } from "./api/ws-manager";
import { shouldRetryQuery } from "./api/rate-limit";
import { WS_URL, ENABLED_TABS } from "./lib/constants";
import type { PacketDetail } from "./types/api";

// Map is the only heavy tab (maplibre-gl is ~1MB), so lazy-load it — its chunk is fetched the
// first time someone opens the Map tab instead of bloating the initial bundle.
const MapView = lazy(() => import("./features/map/MapView").then((m) => ({ default: m.MapView })));

// Stats pulls in ECharts (~150-200KB gz), so lazy-load it too — the chunk loads on first visit to Stats.
const StatsOverview = lazy(() => import("./features/stats/StatsOverview").then((m) => ({ default: m.StatsOverview })));

// global singletons

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
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

// null-render component -- easiest way to sync region changes into the WS manager

function RegionWatcher({ wsManager: mgr }: { wsManager: WsManager }) {
  const { iatas, regionKey } = useRegion();

  useEffect(() => {
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
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const next = selectionToParams(selection, searchParams);
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true, state: location.state });
  }, [selection, searchParams, setSearchParams, location.state]);

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

function AppInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleCloseNode = useCallback(() => {
    setSelectedNodeId(null);
    dropSelectionParam("node");
  }, [dropSelectionParam, setSelectedNodeId]);

  // An observer opens its dashboard; a packet it was inspected from moves into the side drawer beside it.
  const viewObserver = useCallback((id: string, packet?: { hash: string; observationId?: number }) => {
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

  useEffect(() => {
    // Region slugs can't be expanded yet (region details load async) — connect with the directly
    // selected IATAs; RegionWatcher narrows the subscription once useRegion resolves the slugs.
    wsManager.connect({ iatas: resolveIatas(initialSelection, new Map()), events: WS_EVENTS });
    return () => wsManager.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabContent: Record<string, React.ReactNode> = {
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
    Observers: <ObserverPage wsManager={wsManager} onAnalyzePacket={handleAnalyze} />,
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
          <div key={activeTab} className="flex flex-1 min-h-0 min-w-0 fade-in">
            <Suspense fallback={<TabLoading tab={activeTab} />}>
              {tabContent[activeTab]}
            </Suspense>
          </div>
          {analyzerHash && activeTab !== "Map" && activeTab !== "Analytics" && (
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
          {(activeTab === "Map" || activeTab === "Nodes") && selectedNodeId && (
            <NodeDetailPanel
              nodeId={selectedNodeId}
              onClose={handleCloseNode}
              onViewObserver={viewObserver}
              onViewNode={setSelectedNodeId}
              onAnalyzePacket={viewPacket}
              onViewOnMap={activeTab === "Map" ? undefined : (lat, lng) => handleViewOnMap(selectedNodeId, lat, lng)}
            />
          )}
          {panels.map((panel, index) => <InvestigationPanel key={panel.key} target={panel.target} inactive={index !== panels.length - 1} onClose={() => closePanel(index)} onOpen={openPanel} onViewObserver={viewObserver} onViewOnMap={activeTab === "Map" ? undefined : handleViewOnMap} />)}
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
          <AppInner />
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
