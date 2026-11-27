import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../src/App";

vi.mock("../src/api/ws-manager", () => ({ WsManager: class {
  connect() {} disconnect() {} pause() {} resume() { return false; } updateSubscription() {}
} }));
vi.mock("../src/api/client", () => ({
  getRegions: async () => [], getRegion: async () => ({ iatas: [] }), getBrokers: async () => [], getScopes: async () => [],
  getObserver: async (id: string) => ({ id, publicKey: id === "o-node" ? "AB12" : "cd34" }),
  getNodesPage: async (_r: unknown, { pubkey }: { pubkey: string }) => ({ items: pubkey === "ab12" ? [{ id: "n-obs", publicKey: "ab12" }] : [], nextCursor: null, hasMore: false }),
}));
vi.mock("../src/components/SplashScreen", () => ({ SplashScreen: () => null }));
vi.mock("../src/components/VersionGate", () => ({ VersionGate: () => null }));
vi.mock("../src/components/AppShell", () => ({ AppShell: ({ children, onTabChange }: { children: ReactNode; onTabChange: (tab: string) => void }) =>
  <><button onClick={() => onTabChange("Map")}>Map tab</button><button onClick={() => onTabChange("Routes")}>Route tab</button>{children}</> }));
vi.mock("../src/features/nodes/NodeTable", () => ({ NodeTable: () => null }));
vi.mock("../src/features/map/MapView", () => ({ MapView: () => null }));
vi.mock("../src/features/routes/RouteTable", () => ({ RouteTable: ({ onViewObserver }: { onViewObserver: (id: string) => void }) =>
  <><button onClick={() => onViewObserver("o-node")}>Observer with node</button><button onClick={() => onViewObserver("o-bare")}>Observer alone</button></> }));
vi.mock("../src/features/observers/ObserverPage", () => ({ ObserverPage: () => <h1>Observer dashboard</h1> }));
vi.mock("../src/features/nodes/NodeDetailPanel", () => ({
  NodeDetailPanel: ({ nodeId, view, onViewChange, onClose, onOpenObserverDashboard }: { nodeId: string; view?: string; onViewChange?: (v: string) => void; onClose: () => void; onOpenObserverDashboard?: (id: string) => void }) => <>
    <h2>Node {nodeId} {view ?? "node"}</h2>
    {onViewChange && <><button onClick={() => onViewChange("observer")}>To observer</button><button onClick={() => onViewChange("node")}>To node</button></>}
    <button onClick={onClose}>Close node</button>
    <button onClick={() => onOpenObserverDashboard?.("o-node")}>Dashboard</button>
  </>,
}));

const params = () => new URLSearchParams(window.location.search);
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name, exact: true }));

beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }));
afterEach(() => vi.unstubAllGlobals());

describe("docked node panel view in the URL", () => {
  it("restores view=observer for the linked node and writes the choice back", () => {
    window.history.replaceState({}, "", "/?tab=Nodes&node=n1&view=observer");
    render(<App />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Node n1 observer");
    click("To node");
    expect(params().get("view")).toBeNull();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Node n1 node");
    click("To observer");
    expect(params().get("view")).toBe("observer");
    expect(params().get("node")).toBe("n1");
  });

  it("drops view with node on close", () => {
    window.history.replaceState({}, "", "/?tab=Nodes&node=n1&view=observer");
    render(<App />);
    click("Close node");
    expect(params().get("node")).toBeNull();
    expect(params().get("view")).toBeNull();
  });

  it("keeps the view when the desktop panel moves to the map, drops it elsewhere", async () => {
    window.history.replaceState({}, "", "/?tab=Nodes&node=n1&view=observer");
    render(<App />);
    click("Map tab");
    expect(params().get("view")).toBe("observer");
    click("Route tab");
    expect(params().get("view")).toBeNull();
  });

  it("drops the view on a mobile tab switch, which closes the panel", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: /max-width/.test(query), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
    window.history.replaceState({}, "", "/?tab=Nodes&node=n1&view=observer");
    render(<App />);
    click("Map tab");
    expect(params().get("view")).toBeNull();
  });

  it("opens the dashboard from the panel's Observer view", async () => {
    window.history.replaceState({}, "", "/?tab=Nodes&node=n1&view=observer");
    render(<App />);
    click("Dashboard");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Observer dashboard");
    expect(params().get("observer")).toBe("o-node");
  });
});

describe("opening an observer", () => {
  it("opens the merged node panel on its Observer view when the observer is a node", async () => {
    window.history.replaceState({}, "", "/?tab=Routes");
    render(<App />);
    click("Observer with node");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Node n-obs observer");
    expect(params().get("tab")).toBe("Routes");
  });

  it("keeps the dashboard for an observer with no node record", async () => {
    window.history.replaceState({}, "", "/?tab=Routes");
    render(<App />);
    click("Observer alone");
    await waitFor(() => expect(params().get("observer")).toBe("o-bare"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
