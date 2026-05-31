import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { BrowserRouter, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { RegionProvider, useRegion } from "./hooks/useRegion";
import { ThemeProvider } from "./hooks/useTheme";
import { AppShell } from "./components/AppShell";
import { SplashScreen } from "./components/SplashScreen";
import { PacketList } from "./features/packets/PacketList";
import { PacketAnalyzerDrawer } from "./features/packets/PacketAnalyzerDrawer";
import { NodeTable } from "./features/nodes/NodeTable";
import { NodeDetailPanel } from "./features/nodes/NodeDetailPanel";
import { ObserverTable } from "./features/observers/ObserverTable";
import { ChannelList } from "./features/channels/ChannelList";
import { StatsOverview } from "./features/stats/StatsOverview";
import { EmptyState } from "./components/EmptyState";
import { getPacketDetail } from "./api/client";
import { WsManager } from "./api/ws-manager";
import { WS_URL } from "./lib/constants";

// Map is the only heavy tab (maplibre-gl is ~1MB), so lazy-load it — its chunk is fetched the
// first time someone opens the Map tab instead of bloating the initial bundle.
const MapView = lazy(() => import("./features/map/MapView").then((m) => ({ default: m.MapView })));

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

// null-render component -- easiest way to sync region changes into the WS manager

function RegionWatcher({ wsManager: mgr }: { wsManager: WsManager }) {
  const region = useRegion();

  useEffect(() => {
    mgr.updateSubscription({ iatas: region === "*" ? undefined : [region], events: ["packetObservation", "channelMessage", "observerStatus", "nodeUpdate"] });
  }, [mgr, region]);

  return null;
}

// Mirror the active region into the URL (?iata=) so the address bar is always shareable — on a
// dropdown change and on load (including a region restored from localStorage, which users wouldn't
// otherwise know was shareable). "*" (All) clears it; any legacy ?region is folded into ?iata. The
// guard skips redundant writes (and any setSearchParams feedback loop); replace keeps it out of history.
function RegionUrlSync() {
  const region = useRegion();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const desired = region === "*" ? null : region;
    if (searchParams.get("iata") === desired && !searchParams.has("region")) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (desired === null) next.delete("iata");
        else next.set("iata", desired);
        next.delete("region");
        return next;
      },
      { replace: true },
    );
  }, [region, searchParams, setSearchParams]);

  return null;
}

// Drop the shared node selection when the region changes, so the detail panel doesn't keep showing a
// node that's no longer in the re-queried map/table. Lives inside RegionProvider so it can read useRegion.
function SelectionResetOnRegion({ onRegionChange }: { onRegionChange: () => void }) {
  const region = useRegion();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false; // skip the initial mount; only react to a real change
      return;
    }
    onRegionChange();
  }, [region, onRegionChange]);

  return null;
}

// tab state and region init

const DRAWER_STORAGE_KEY = "beacon-analyzer-open";

function AppInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") ?? "Packets");
  // ?iata is the canonical, shareable param; ?region is honored as a legacy fallback. || (not ??)
  // so an empty ?iata= falls through instead of sticking as "". URL codes are upper-cased to match
  // the dropdown's IATA codes (so a shared/typed ?iata=yyz still resolves).
  const initialRegion =
    searchParams.get("iata")?.toUpperCase() ||
    searchParams.get("region")?.toUpperCase() ||
    localStorage.getItem("beacon-region") ||
    "*";

  const [analyzerHash, setAnalyzerHash] = useState<string | null>(() => searchParams.get("hash"));
  const [selectedObservationId, setSelectedObservationId] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(() => {
    const stored = localStorage.getItem(DRAWER_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });

  const { data: analyzerDetail } = useQuery({
    queryKey: ["packet-detail", analyzerHash],
    queryFn: () => getPacketDetail(analyzerHash!),
    enabled: !!analyzerHash,
    staleTime: Infinity,
  });

  const handleAnalyze = useCallback((hash: string | null) => {
    setAnalyzerHash(hash);
    setSelectedObservationId(null);
    if (hash) {
      setDrawerOpen(true);
      localStorage.setItem(DRAWER_STORAGE_KEY, "true");
    }
  }, []);

  const handleToggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => {
      const next = !prev;
      localStorage.setItem(DRAWER_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  const clearSelection = useCallback(() => setSelectedNodeId(null), []);

  useEffect(() => {
    wsManager.connect({ iatas: initialRegion === "*" ? undefined : [initialRegion], events: ["packetObservation", "channelMessage", "observerStatus", "nodeUpdate"] });
    return () => wsManager.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabContent: Record<string, React.ReactNode> = {
    Packets: <PacketList wsManager={wsManager} onAnalyze={handleAnalyze} />,
    Nodes: <NodeTable wsManager={wsManager} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />,
    Observers: <ObserverTable wsManager={wsManager} />,
    Channels: <ChannelList wsManager={wsManager} onAnalyze={handleAnalyze} />,
    Stats: <StatsOverview />,
    Map: <MapView wsManager={wsManager} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />,
  };

  return (
    <RegionProvider defaultRegion={initialRegion}>
      <RegionWatcher wsManager={wsManager} />
      <RegionUrlSync />
      <SelectionResetOnRegion onRegionChange={clearSelection} />
      <AppShell activeTab={activeTab} onTabChange={handleTabChange} wsManager={wsManager}>
        <div className="flex flex-1 min-h-0">
          <div key={activeTab} className="flex flex-1 min-h-0 fade-in">
            <Suspense fallback={<EmptyState title={activeTab} subtitle="Loading…" />}>
              {tabContent[activeTab]}
            </Suspense>
          </div>
          {analyzerHash && (activeTab === "Packets" || activeTab === "Channels") && (
            <PacketAnalyzerDrawer
              detail={analyzerDetail}
              selectedObservationId={selectedObservationId}
              onSelectObservation={setSelectedObservationId}
              open={drawerOpen}
              onToggle={handleToggleDrawer}
            />
          )}
          {(activeTab === "Map" || activeTab === "Nodes") && selectedNodeId && (
            <NodeDetailPanel nodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />
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
