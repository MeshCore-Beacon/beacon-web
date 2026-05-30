import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { RegionProvider, useRegion } from "./hooks/useRegion";
import { ThemeProvider } from "./hooks/useTheme";
import { AppShell } from "./components/AppShell";
import { SplashScreen } from "./components/SplashScreen";
import { PacketList } from "./features/packets/PacketList";
import { PacketAnalyzerDrawer } from "./features/packets/PacketAnalyzerDrawer";
import { NodeTable } from "./features/nodes/NodeTable";
import { ObserverTable } from "./features/observers/ObserverTable";
import { ChannelList } from "./features/channels/ChannelList";
import { StatsOverview } from "./features/stats/StatsOverview";
import { MapView } from "./features/map/MapView";
import { getPacketDetail } from "./api/client";
import { WsManager } from "./api/ws-manager";
import { WS_URL } from "./lib/constants";

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

// tab state and region init

const DRAWER_STORAGE_KEY = "beacon-analyzer-open";

function AppInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") ?? "Packets");
  const initialRegion = searchParams.get("region") ?? localStorage.getItem("beacon-region") ?? "*";

  const [analyzerHash, setAnalyzerHash] = useState<string | null>(() => searchParams.get("hash"));
  const [selectedObservationId, setSelectedObservationId] = useState<number | null>(null);
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

  useEffect(() => {
    wsManager.connect({ iatas: initialRegion === "*" ? undefined : [initialRegion], events: ["packetObservation", "channelMessage", "observerStatus", "nodeUpdate"] });
    return () => wsManager.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabContent: Record<string, React.ReactNode> = {
    Packets: <PacketList wsManager={wsManager} onAnalyze={handleAnalyze} />,
    Nodes: <NodeTable wsManager={wsManager} />,
    Observers: <ObserverTable wsManager={wsManager} />,
    Channels: <ChannelList wsManager={wsManager} onAnalyze={handleAnalyze} />,
    Stats: <StatsOverview />,
    Map: <MapView />,
  };

  return (
    <RegionProvider defaultRegion={initialRegion}>
      <RegionWatcher wsManager={wsManager} />
      <AppShell activeTab={activeTab} onTabChange={handleTabChange} wsManager={wsManager}>
        <div className="flex flex-1 min-h-0">
          <div key={activeTab} className="flex flex-1 min-h-0 fade-in">
            {tabContent[activeTab]}
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
