import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

const params = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("View on map", () => {
  it("frames the node on the Map tab and keeps its panel open there", async () => {
    window.history.replaceState({}, "", "/?tab=Nodes&node=node-a");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "View on map" }));
    expect(await screen.findByText("Map view")).toBeInTheDocument();
    expect(params().get("tab")).toBe("Map");
    expect(params().get("lat")).toBe("45.42153");
    expect(params().get("lng")).toBe("-75.69719");
    expect(params().get("zoom")).toBe("14");
    expect(screen.getByRole("region", { name: "Node node-a" })).toBeInTheDocument();
  });

  it("is not offered while the map is already showing", async () => {
    window.history.replaceState({}, "", "/?tab=Map&node=node-a");
    render(<App />);
    await screen.findByText("Map view");
    expect(screen.getByRole("region", { name: "Node node-a" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View on map" })).not.toBeInTheDocument();
  });

  it("drops the one-off map framing when leaving the Map tab", async () => {
    window.history.replaceState({}, "", "/?tab=Nodes&node=node-a");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "View on map" }));
    await screen.findByText("Map view");
    fireEvent.click(screen.getByText("Nodes tab"));
    expect(params().get("tab")).toBe("Nodes");
    expect(params().has("lat")).toBe(false);
    expect(params().has("lng")).toBe(false);
    expect(params().has("zoom")).toBe(false);
  });

  it("closes stacked investigation panels and selects that node on the map", async () => {
    window.history.replaceState({}, "", "/?tab=Packets&hash=abcd&analyze=1");
    render(<App />);
    fireEvent.click(screen.getByText("Hop node"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View on map" }));
    expect(await screen.findByText("Map view")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Node node-b" })).toBeInTheDocument();
  });
});
