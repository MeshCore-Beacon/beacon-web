import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useSearchParams } from "react-router-dom";
import { App } from "../src/App";
import { useRegionSelection } from "../src/hooks/useRegion";
import type { PacketDetail } from "../src/types/api";
import i18n from "../src/i18n";

vi.mock("../src/api/ws-manager", () => ({ WsManager: class {
  connect() {} disconnect() {} updateSubscription() {}
} }));
vi.mock("../src/api/client", () => ({ getRegions: async () => [], getRegion: async () => ({ iatas: [] }), getBrokers: async () => [], getScopes: async () => [] }));
vi.mock("../src/components/SplashScreen", () => ({ SplashScreen: () => null }));
vi.mock("../src/components/AppShell", () => ({ AppShell: ({ children, onTabChange }: { children: ReactNode; onTabChange: (tab: string) => void }) => {
  const { setSelection } = useRegionSelection();
  return <><button onClick={() => onTabChange("Observers")}>Observer tab</button><button onClick={() => onTabChange("Routes")}>Route tab</button><button onClick={() => onTabChange("Analytics")}>Analytics tab</button><button onClick={() => setSelection({ regions: [], iatas: ["YVR"] })}>Change region</button>{children}</>;
} }));
vi.mock("../src/features/routes/RouteTable", () => ({ RouteTable: ({ onViewObserver, onAnalyzePacket, onViewNode }: { onViewObserver: (id: string) => void; onAnalyzePacket: (hash: string, id: number) => void; onViewNode: (id: string) => void }) => {
  const [filter, setFilter] = useState(""); const [params] = useSearchParams();
  return <div data-testid="route-origin"><input aria-label="Route filter" value={filter} onChange={e => setFilter(e.target.value)} /><output data-testid="origin-url">{params.toString()}</output><div data-testid="route-scroll" style={{ height: 80, overflow: "auto" }}><div style={{ height: 1000 }}>Routes</div></div><button onClick={() => onViewObserver("o1")}>Route observer</button><button onClick={() => onAnalyzePacket("aa", 7)}>Route packet</button><button onClick={() => onViewNode("n1")}>Route node</button></div>;
} }));
vi.mock("../src/features/observers/ObserverSidebar", () => ({ ObserverSidebar: () => <p>Observer directory</p> }));
vi.mock("../src/features/observers/useObserverDirectory", () => ({ useObserverDirectory: () => ({ data: [], isPending: false, isError: false, refetch: () => {} }) }));
vi.mock("../src/features/stats/MeshTab", () => ({ MeshTab: ({ onSelectObserver }: { onSelectObserver: (id: string) => void }) => {
  const [value, setValue] = useState("");
  return <><input aria-label="Analytics local state" value={value} onChange={e => setValue(e.target.value)} /><button onClick={() => onSelectObserver("o1")}>Leaderboard observer</button></>;
} }));
vi.mock("../src/features/stats/ObserverTab", () => ({ ObserverTab: ({ selectedObserverId, range, actions }: { selectedObserverId: string; range: string; actions?: ReactNode }) => <><h1>Dashboard {selectedObserverId} {range}</h1>{actions}</> }));
// Exercise the real analytics shell without loading charts unrelated to its observer action.
vi.mock("../src/features/stats/TrafficTab", () => ({ TrafficTab: () => null }));
vi.mock("../src/features/stats/SignalTab", () => ({ SignalTab: () => null }));
vi.mock("../src/features/stats/PathsTab", () => ({ PathsTab: () => null }));
vi.mock("../src/features/stats/ScopesTab", () => ({ ScopesTab: () => null }));
vi.mock("../src/features/stats/TalkersTab", () => ({ TalkersTab: () => null }));
vi.mock("../src/features/stats/ClockDriftTab", () => ({ ClockDriftTab: () => null }));
vi.mock("../src/features/stats/CompareObserversTab", () => ({ CompareObserversTab: () => null }));
vi.mock("../src/features/stats/NeighbourGraphTab", () => ({ NeighbourGraphTab: () => null }));
vi.mock("../src/features/observers/ObserverDetailPanel", () => ({ ObserverDetailPanel: ({ observerId, onClose, onViewStats, onAnalyzePacket }: { observerId: string; onClose: () => void; onViewStats: (id: string) => void; onAnalyzePacket: (hash: string) => void }) => <><h2>Observer {observerId}</h2><button onClick={onClose}>Close observer</button><button onClick={() => onViewStats(observerId)}>Open dashboard</button><button onClick={() => onAnalyzePacket("bb")}>Advert packet</button></> }));
vi.mock("../src/features/nodes/NodeDetailPanel", () => ({ NodeDetailPanel: ({ nodeId, onClose, onViewObserver }: { nodeId: string; onClose: () => void; onViewObserver: (id: string) => void }) => <><h2>Node {nodeId}</h2><button onClick={onClose}>Close node</button><button onClick={() => onViewObserver("o1")}>Node observer</button></> }));
vi.mock("../src/features/packets/usePacketDetail", () => ({ usePacketDetail: (hash: string | null) => ({ data: hash ? { packetHash: hash, observations: [], header: { payloadType: 1 } } as unknown as PacketDetail : undefined, isLoading: false }) }));
vi.mock("../src/features/packets/PacketAnalyzerDrawer", () => ({ PacketAnalyzerDrawer: ({ detail, onClose, onViewObserver, onViewNode, onViewPath, selectedObservationId, onSelectObservation }: { detail: PacketDetail; onClose: () => void; onViewObserver: (id: string) => void; onViewNode: (id: string) => void; onViewPath: () => void; selectedObservationId: number | null; onSelectObservation: (id: number) => void }) => <><h2>Packet {detail?.packetHash} report {selectedObservationId}</h2><button onClick={onClose}>Close packet</button><button onClick={() => onViewObserver("o1")}>Packet observer</button><button onClick={() => onViewNode("n1")}>Packet node</button><button onClick={onViewPath}>Packet map</button><button onClick={() => onSelectObservation(8)}>Select report 8</button></> }));
vi.mock("../src/features/map/PacketPathMap", () => ({ PacketPathMap: () => <div>Path map</div> }));

beforeEach(() => {
  window.history.replaceState({}, "", "/?tab=Routes&route=full-route&routeIata=YOW");
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => vi.unstubAllGlobals());
const click = (name: string) => { const button = screen.getByRole("button", { name, exact: true }); button.focus(); fireEvent.click(button); };
const escape = () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
const browserBack = async () => { await act(async () => { window.history.back(); }); await waitFor(() => expect(window.location.search).toContain("tab=Routes")); };

describe("observer investigation windows", () => {
  it("dismisses only the observer with Escape and returns keyboard focus", () => {
    render(<App />); click("Route observer"); escape();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Route observer" })).toHaveFocus();
  });
  it("orders route packet -> observer -> advert packet and preserves the earlier report", () => {
    render(<App />); click("Route packet"); click("Select report 8"); click("Packet observer"); click("Advert packet");
    expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Packet bb");
    escape(); expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Observer o1");
    expect(screen.getByRole("button", { name: "Advert packet" })).toHaveFocus();
    escape(); expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Packet aa report 8");
    escape(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps the node and packet underneath the observer when Escape is pressed", () => {
    render(<App />); click("Route packet"); click("Packet node"); click("Node observer");
    escape(); expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Node n1");
    escape(); expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Packet aa");
    click("Packet map"); escape();
    expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Packet aa");
  });
  it("returns to an already-open observer instead of making a cyclic panel chain", () => {
    render(<App />); click("Route packet"); click("Select report 8"); click("Packet observer"); click("Advert packet"); click("Packet observer");
    expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Observer o1");
    escape(); expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Packet aa report 8");
  });
  it("opens the dashboard as a normal tab with every window left open", async () => {
    render(<App />); click("Route packet"); click("Packet observer"); click("Open dashboard");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Dashboard o1 7d");
    expect(window.location.search).toContain("tab=Observers&observer=o1");
    expect(screen.queryByRole("button", { name: "Back to Routes" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Observer o1");
    escape(); expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Packet aa");
  });
  it("returns to the previous tab with browser Back", async () => {
    render(<App />); click("Route observer"); click("Open dashboard");
    await screen.findByRole("heading", { level: 1 });
    await browserBack(); expect(screen.getByTestId("route-origin")).toBeInTheDocument();
  });
  it("keeps the packet drawer and stacked windows across tabs, but not into Analytics", async () => {
    await import("../src/features/stats/StatsOverview");
    window.history.replaceState({}, "", "/?tab=Routes&hash=aa&analyze=1");
    render(<App />);
    expect(screen.getByRole("heading", { name: /Packet aa/ })).toBeInTheDocument();
    click("Packet node");
    click("Observer tab");
    expect(await screen.findByRole("heading", { level: 2, name: /Packet aa/ })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("heading")).toHaveTextContent("Node n1");
    click("Analytics tab");
    await screen.findByRole("button", { name: "Leaderboard observer" });
    expect(screen.queryByRole("heading", { name: /Packet aa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    click("Route tab");
    expect(await screen.findByRole("heading", { name: /Packet aa/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("opens the Observers dashboard from the leaderboard", async () => {
    await import("../src/features/stats/StatsOverview");
    window.history.replaceState({}, "", "/?tab=Analytics&statsTab=mesh&range=24h");
    render(<App />);
    await screen.findByRole("button", { name: "Leaderboard observer" });
    click("Leaderboard observer");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Dashboard o1 24h");
    expect(window.location.search).toContain("tab=Observers");
    expect(window.location.search).toContain("observer=o1");
    expect(window.location.search).not.toContain("statsTab");
  });
  it("redirects legacy Analytics observer links to the Observers dashboard", async () => {
    window.history.replaceState({}, "", "/?tab=Analytics&statsTab=observer&observerId=o2&range=7d");
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Dashboard o2 7d");
    expect(window.location.search).toContain("tab=Observers");
    expect(window.location.search).not.toContain("statsTab");
  });
  it("closes the stacked windows when the region changes", async () => {
    render(<App />); click("Route observer"); click("Open dashboard"); await screen.findByRole("heading", { level: 1 });
    click("Change region");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("clears comparison params from both the observer dashboard and analytics compare tabs on tab change", () => {
    window.history.replaceState({}, "", "/?tab=Observers&observer=o1&compareWith=o2&compareUntil=1700000000000&compareA=x&compareB=y&compareSince=1");
    render(<App />);
    click("Route tab");
    expect(window.location.search).toContain("tab=Routes");
    for (const key of ["observer", "compareWith", "compareUntil", "compareA", "compareB", "compareSince"]) {
      expect(window.location.search).not.toContain(key);
    }
  });
  it("keeps analytics compare params when re-clicking the already-active Analytics tab", async () => {
    await import("../src/features/stats/StatsOverview");
    window.history.replaceState({}, "", "/?tab=Analytics&statsTab=compare&compareA=a&compareB=b&compareSince=1&compareUntil=2");
    render(<App />);
    click("Analytics tab");
    for (const pair of ["compareA=a", "compareB=b", "compareSince=1", "compareUntil=2"]) {
      expect(window.location.search).toContain(pair);
    }
  });
  it("keeps the observer dashboard's compare params when re-clicking the already-active Observer tab", () => {
    window.history.replaceState({}, "", "/?tab=Observers&observer=o1&compareWith=o2&compareUntil=2");
    render(<App />);
    click("Observer tab");
    for (const pair of ["observer=o1", "compareWith=o2", "compareUntil=2"]) {
      expect(window.location.search).toContain(pair);
    }
  });
});
