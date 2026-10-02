import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { App } from "../src/App";

// any on*/subscribe call the Packets tab makes gets a no-op unsubscribe
vi.mock("../src/api/ws-manager", () => ({
  WsManager: class {
    constructor() {
      return new Proxy(this, { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => () => {}) });
    }
    connect() {}
    disconnect() {}
    updateSubscription() {}
  },
}));
vi.mock("../src/api/client", () => ({ getRegions: async () => [], getRegion: async () => ({ iatas: [] }), getScopes: async () => [] }));
vi.mock("../src/lib/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/constants")>();
  return { ...actual, ENABLED_TABS: actual.ENABLED_TABS.filter((tab) => tab !== "Map") };
});
vi.mock("../src/components/SplashScreen", () => ({ SplashScreen: () => null }));
vi.mock("../src/components/AppShell", () => ({
  AppShell: ({ children, onTabChange }: { children: ReactNode; onTabChange: (tab: string) => void }) => (
    <>
      <button onClick={() => onTabChange("Nodes")}>Nodes tab</button>
      <button onClick={() => onTabChange("Packets")}>Packets tab</button>
      {children}
    </>
  ),
}));
vi.mock("../src/features/nodes/NodeTable", () => ({ NodeTable: () => null }));
vi.mock("../src/features/map/MapView", () => ({ MapView: () => <p>Map view</p> }));
vi.mock("../src/features/nodes/NodeDetailPanel", () => ({
  NodeDetailPanel: ({ nodeId, onViewOnMap }: { nodeId: string; onViewOnMap?: (lat: number, lng: number) => void }) => (
    <section aria-label={`Node ${nodeId}`}>
      {onViewOnMap && <button onClick={() => onViewOnMap(45.42153, -75.69719)}>View on map</button>}
    </section>
  ),
}));
vi.mock("../src/features/packets/usePacketDetail", () => ({
  usePacketDetail: (hash: string | null) => ({ data: hash ? { packetHash: hash, observations: [], header: { payloadType: 4 } } : undefined, isLoading: false }),
}));
vi.mock("../src/features/packets/PacketTable", () => ({ PacketTable: () => null }));
vi.mock("../src/features/packets/PacketAnalyzerDrawer", () => ({
  PacketAnalyzerDrawer: ({ onViewNode }: { onViewNode: (id: string) => void }) => <button onClick={() => onViewNode("node-b")}>Hop node</button>,
}));

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("View on map with the Map tab disabled", () => {
  it("is not offered", async () => {
    window.history.replaceState({}, "", "/?tab=Nodes&node=node-a");
    render(<App />);
    expect(await screen.findByRole("region", { name: "Node node-a" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View on map" })).not.toBeInTheDocument();
  });
});
