import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { BrowserRouter, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
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
import { AppShell, TABS } from "./components/AppShell";
import { SplashScreen } from "./components/SplashScreen";
import { PacketList } from "./features/packets/PacketList";
import { PacketAnalyzerDrawer } from "./features/packets/PacketAnalyzerDrawer";
import { PacketAnalyzerOverlay } from "./features/packets/PacketAnalyzerOverlay";
import { NodeTable } from "./features/nodes/NodeTable";
import { NodeDetailPanel } from "./features/nodes/NodeDetailPanel";
import { NodeDetailOverlay } from "./features/nodes/NodeDetailOverlay";
import { ObserverTable } from "./features/observers/ObserverTable";
import { RouteTable } from "./features/routes/RouteTable";
import { TraceList } from "./features/traces/TraceList";
import { ChannelList } from "./features/channels/ChannelList";
import { EmptyState } from "./components/EmptyState";
import { getPacketDetail } from "./api/client";
import { WsManager } from "./api/ws-manager";
import { WS_URL } from "./lib/constants";

// Map is the only heavy tab (maplibre-gl is ~1MB), so lazy-load it — its chunk is fetched the
// first time someone opens the Map tab instead of bloating the initial bundle.
const MapView = lazy(() => import("./features/map/MapView").then((m) => ({ default: m.MapView })));

// Stats pulls in ECharts (~150-200KB gz), so lazy-load it too — the chunk loads on first visit to Stats.
const StatsOverview = lazy(() => import("./features/stats/StatsOverview").then((m) => ({ default: m.StatsOverview })));

// global singletons

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
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
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const next = selectionToParams(selection, searchParams);
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [selection, searchParams, setSearchParams]);

  return null;
}

// Drop the shared node selection when the region changes, so the detail panel doesn't keep showing a
// node that's no longer in the re-queried map/table. Lives inside RegionProvider so it can read useRegion.
function SelectionResetOnRegion({ onRegionChange }: { onRegionChange: () => void }) {
  const { regionKey } = useRegion();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false; // skip the initial mount; only react to a real change
      return;
    }
    onRegionChange();
  }, [regionKey, onRegionChange]);

  return null;
}

// tab state and region init

function AppInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  // The URL is the single source of truth for the active tab — back/forward just work, and an
  // unknown ?tab value falls back to Packets instead of rendering a blank pane.
  const tabParam = searchParams.get("tab");
  const activeTab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as string) : "Packets";
  // Resolve the starting selection once from URL → storage → legacy key (see computeInitialSelection).
  const [initialSelection] = useState(() => computeInitialSelection(searchParams));

  const [analyzerHash, setAnalyzerHash] = useState<string | null>(() => searchParams.get("hash"));
  const [selectedObservationId, setSelectedObservationId] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // lifted (like selectedNodeId) so a node's "View observer" link can select it before the tab mounts
  const [selectedObserverId, setSelectedObserverId] = useState<string | null>(null);
  // node detail shown as a modal over the packet analyzer (e.g. clicking a resolved path hop)
  const [overlayNodeId, setOverlayNodeId] = useState<string | null>(null);
  // packet analyzer shown as a modal over the node panel (clicking a node's observation row)
  const [overlayPacketHash, setOverlayPacketHash] = useState<string | null>(null);

  const { data: analyzerDetail, isLoading: analyzerLoading } = useQuery({
    queryKey: ["packet-detail", analyzerHash],
    queryFn: () => getPacketDetail(analyzerHash!),
    enabled: !!analyzerHash,
    staleTime: Infinity,
  });

  const { data: overlayPacketDetail, isLoading: overlayPacketLoading } = useQuery({
    queryKey: ["packet-detail", overlayPacketHash],
    queryFn: () => getPacketDetail(overlayPacketHash!),
    enabled: !!overlayPacketHash,
    staleTime: Infinity,
  });

  const handleAnalyze = useCallback((hash: string | null) => {
    setAnalyzerHash(hash);
    setSelectedObservationId(null);
  }, []);

  const handleTabChange = (tab: string) => {
    setOverlayNodeId(null);
    setOverlayPacketHash(null);
    // On mobile a detail panel fills the screen, so leaving its tab must close it; desktop side
    // panels persist across tabs. Cross-nav (onViewObserver) re-sets its selection after this.
    if (isMobile) {
      setAnalyzerHash(null);
      setSelectedObservationId(null);
      setSelectedNodeId(null);
      setSelectedObserverId(null);
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setOverlayNodeId(null);
    setOverlayPacketHash(null);
    setSelectedObserverId(null);
  }, []);

  // Jump from an observer's detail panel to its telemetry on the Stats tab (Stats → Observer, preselected).
  const handleViewObserverStats = useCallback(
    (id: string) => {
      setOverlayNodeId(null);
      setOverlayPacketHash(null);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "Stats");
        next.set("statsTab", "observer");
        next.set("observerId", id);
        return next;
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    // Region slugs can't be expanded yet (region details load async) — connect with the directly
    // selected IATAs; RegionWatcher narrows the subscription once useRegion resolves the slugs.
    wsManager.connect({ iatas: resolveIatas(initialSelection, new Map()), events: WS_EVENTS });
    return () => wsManager.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabContent: Record<string, React.ReactNode> = {
    Packets: <PacketList wsManager={wsManager} onAnalyze={handleAnalyze} />,
    Nodes: <NodeTable wsManager={wsManager} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />,
    Observers: <ObserverTable wsManager={wsManager} selectedObserverId={selectedObserverId} onSelectObserver={setSelectedObserverId} onAnalyzePacket={setOverlayPacketHash} onViewStats={handleViewObserverStats} />,
    Routes: <RouteTable />,
    // analyze opens the packet overlay (modal) rather than the side drawer, which suits the
    // master/detail layout and renders on any tab — same path NodeDetailPanel's onAnalyzePacket uses
    Traces: <TraceList onAnalyze={setOverlayPacketHash} onViewNode={setOverlayNodeId} />,
    Channels: <ChannelList wsManager={wsManager} onAnalyze={handleAnalyze} />,
    Stats: <StatsOverview wsManager={wsManager} />,
    Map: <MapView wsManager={wsManager} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />,
  };

  return (
    <RegionProvider defaultSelection={initialSelection}>
      <RegionWatcher wsManager={wsManager} />
      <RegionUrlSync />
      <SelectionResetOnRegion onRegionChange={clearSelection} />
      <AppShell activeTab={activeTab} onTabChange={handleTabChange} wsManager={wsManager}>
        <div className="relative flex flex-1 min-h-0">
          <div key={activeTab} className="flex flex-1 min-h-0 fade-in">
            <Suspense fallback={<EmptyState title={activeTab} subtitle="Loading…" />}>
              {tabContent[activeTab]}
            </Suspense>
          </div>
          {analyzerHash && (activeTab === "Packets" || activeTab === "Channels") && (
            <PacketAnalyzerDrawer
              detail={analyzerDetail}
              loading={analyzerLoading}
              selectedObservationId={selectedObservationId}
              onSelectObservation={setSelectedObservationId}
              onClose={() => handleAnalyze(null)}
              onViewNode={setOverlayNodeId}
            />
          )}
          {(activeTab === "Map" || activeTab === "Nodes") && selectedNodeId && (
            <NodeDetailPanel
              nodeId={selectedNodeId}
              onClose={() => setSelectedNodeId(null)}
              onViewObserver={(observerId) => {
                handleTabChange("Observers");
                setSelectedObserverId(observerId);
              }}
              onViewNode={setSelectedNodeId}
              onAnalyzePacket={setOverlayPacketHash}
            />
          )}
          {overlayNodeId && (
            <NodeDetailOverlay
              nodeId={overlayNodeId}
              onClose={() => setOverlayNodeId(null)}
              onViewObserver={(observerId) => {
                handleTabChange("Observers");
                setSelectedObserverId(observerId);
              }}
              onViewNode={setOverlayNodeId}
            />
          )}
          {overlayPacketHash && (
            <PacketAnalyzerOverlay
              detail={overlayPacketDetail}
              loading={overlayPacketLoading}
              onClose={() => setOverlayPacketHash(null)}
              onViewObserver={(observerId) => {
                handleTabChange("Observers");
                setSelectedObserverId(observerId);
              }}
            />
          )}
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
