import React, { useState, useEffect } from "react";
import { BrowserRouter, useSearchParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegionProvider, useRegion } from "./hooks/useRegion";
import { ThemeProvider } from "./hooks/useTheme";
import { AppShell } from "./components/AppShell";
import { PacketList } from "./features/packets/PacketList";
import { NodeTable } from "./features/nodes/NodeTable";
import { ObserverTable } from "./features/observers/ObserverTable";
import { ChannelList } from "./features/channels/ChannelList";
import { StatsOverview } from "./features/stats/StatsOverview";
import { MapView } from "./features/map/MapView";
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
    mgr.updateSubscription({ iatas: region === "*" ? undefined : [region], events: ["packetObservation", "channelMessage", "observerStatus"] });
  }, [mgr, region]);

  return null;
}

// tab state and region init

function AppInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") ?? "Packets");
  const initialRegion = searchParams.get("region") ?? localStorage.getItem("tower-region") ?? "*";

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  useEffect(() => {
    wsManager.connect({ iatas: initialRegion === "*" ? undefined : [initialRegion], events: ["packetObservation", "channelMessage", "observerStatus"] });
    return () => wsManager.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabContent: Record<string, React.ReactNode> = {
    Packets: <PacketList wsManager={wsManager} />,
    Nodes: <NodeTable />,
    Observers: <ObserverTable wsManager={wsManager} />,
    Channels: <ChannelList wsManager={wsManager} />,
    Stats: <StatsOverview />,
    Map: <MapView />,
  };

  return (
    <RegionProvider defaultRegion={initialRegion}>
      <RegionWatcher wsManager={wsManager} />
      <AppShell activeTab={activeTab} onTabChange={handleTabChange} wsManager={wsManager}>
        {tabContent[activeTab]}
      </AppShell>
    </RegionProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppInner />
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
