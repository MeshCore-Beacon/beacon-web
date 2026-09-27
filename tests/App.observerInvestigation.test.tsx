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
vi.mock("../src/api/client", () => ({ getRegions: async () => [], getRegion: async () => ({ iatas: [] }) }));
vi.mock("../src/components/SplashScreen", () => ({ SplashScreen: () => null }));
vi.mock("../src/components/AppShell", () => ({ AppShell: ({ children, onTabChange }: { children: ReactNode; onTabChange: (tab: string) => void }) => {
  const { setSelection } = useRegionSelection();
  return <><button onClick={() => onTabChange("Observers")}>Observer tab</button><button onClick={() => onTabChange("Routes")}>Route tab</button><button onClick={() => setSelection({ regions: [], iatas: ["YVR"] })}>Change region</button>{children}</>;
} }));
vi.mock("../src/features/routes/RouteTable", () => ({ RouteTable: ({ onViewObserver, onAnalyzePacket, onViewNode }: { onViewObserver: (id: string) => void; onAnalyzePacket: (hash: string, id: number) => void; onViewNode: (id: string) => void }) => {
  const [filter, setFilter] = useState(""); const [params] = useSearchParams();
  return <div data-testid="route-origin"><input aria-label="Route filter" value={filter} onChange={e => setFilter(e.target.value)} /><output data-testid="origin-url">{params.toString()}</output><div data-testid="route-scroll" style={{ height: 80, overflow: "auto" }}><div style={{ height: 1000 }}>Routes</div></div><button onClick={() => onViewObserver("o1")}>Route observer</button><button onClick={() => onAnalyzePacket("aa", 7)}>Route packet</button><button onClick={() => onViewNode("n1")}>Route node</button></div>;
} }));
vi.mock("../src/features/observers/ObserverTable", () => ({ ObserverTable: () => <p>Observer directory</p> }));
vi.mock("../src/features/stats/MeshTab", () => ({ MeshTab: ({ onSelectObserver }: { onSelectObserver: (id: string) => void }) => {
  const [value, setValue] = useState("");
  return <><input aria-label="Analytics local state" value={value} onChange={e => setValue(e.target.value)} /><button onClick={() => onSelectObserver("o1")}>Leaderboard observer</button></>;
} }));
vi.mock("../src/features/stats/ObserverTab", () => ({ ObserverTab: ({ selectedObserverId, range }: { selectedObserverId: string; range: string }) => <h1>Dashboard {selectedObserverId} {range}</h1> }));
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

describe("observer investigation return", () => {
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
  it("returns from a changed dashboard window to the same route, filter, scroll and observer", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Route filter"), { target: { value: "roof" } });
    screen.getByTestId("route-scroll").scrollTop = 180;
    click("Route observer"); click("Open dashboard");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Dashboard o1 7d");
    expect(window.location.search).toContain("tab=Observers&observer=o1");
    expect(screen.getByTestId("origin-url")).toHaveTextContent("route=full-route");
    fireEvent.change(screen.getByRole("combobox", { name: "Time range" }), { target: { value: "30d" } });
    click("Compare with…");
    expect(window.location.search).toContain("compareWith=");
    click("Back to Routes");
    await waitFor(() => expect(window.location.search).toContain("tab=Routes"));
    expect(screen.getByLabelText("Route filter")).toHaveValue("roof");
    expect(screen.getByTestId("route-scroll").scrollTop).toBe(180);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open dashboard" })).toHaveFocus());
    escape(); expect(screen.getByRole("button", { name: "Route observer" })).toHaveFocus();
  });
  it("supports browser Back/Forward without rebuilding the originating screen", async () => {
    render(<App />); fireEvent.change(screen.getByLabelText("Route filter"), { target: { value: "keep" } });
    click("Route observer"); click("Open dashboard");
    await screen.findByRole("heading", { level: 1 });
    await browserBack(); expect(screen.getByLabelText("Route filter")).toHaveValue("keep");
    await act(async () => { window.history.forward(); });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Dashboard o1");
    await browserBack(); expect(screen.getByLabelText("Route filter")).toHaveValue("keep");
  });
  it("uses the same return flow for the Analytics observer leaderboard", async () => {
    await import("../src/features/stats/StatsOverview");
    window.history.replaceState({}, "", "/?tab=Analytics&statsTab=mesh&range=24h");
    render(<App />);
    fireEvent.change(await screen.findByLabelText("Analytics local state"), { target: { value: "keep analytics" } });
    click("Leaderboard observer");
    expect(await screen.findByRole("button", { name: "Back to Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dashboard o1 24h");
    click("Back to Analytics");
    await waitFor(() => expect(window.location.search).toContain("statsTab=mesh"));
    expect(screen.getByLabelText("Analytics local state")).toHaveValue("keep analytics");
  });
  it("does not invent a return destination for a reloaded/shared dashboard", async () => {
    window.history.replaceState({ usr: { beaconObserverReturnKey: "old" } }, "", "/?tab=Observers&observer=o2&range=24h");
    render(<App />); expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Dashboard o2 24h");
    expect(screen.queryByRole("button", { name: "Back to Routes" })).not.toBeInTheDocument();
    click("← Back to observers"); expect(screen.getByText("Observer directory")).toBeInTheDocument();
  });
  it("ends the retained investigation when the operator changes tabs or regions", async () => {
    render(<App />); click("Route observer"); click("Open dashboard"); await screen.findByRole("heading", { level: 1 });
    click("Change region");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Back to Routes" })).not.toBeInTheDocument());
    expect(screen.queryByTestId("route-origin")).not.toBeInTheDocument();
    click("Route tab"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("translates the return action", async () => {
    await i18n.changeLanguage("fr"); render(<App />); click("Route observer"); click("Open dashboard");
    expect(await screen.findByRole("button", { name: /Retour à « Routes »/ })).toBeInTheDocument();
  });
});
