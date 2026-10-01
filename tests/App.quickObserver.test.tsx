import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { App } from "../src/App";
import { ModalOverlay } from "../src/components/ModalOverlay";

vi.mock("../src/api/ws-manager", () => ({ WsManager: class { connect() {} disconnect() {} updateSubscription() {} } }));
vi.mock("../src/api/client", () => ({ getRegions: async () => [], getRegion: async () => ({ iatas: [] }) }));
vi.mock("../src/components/SplashScreen", () => ({ SplashScreen: () => null }));
vi.mock("../src/components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../src/features/nodes/NodeTable", () => ({ NodeTable: () => null }));
vi.mock("../src/features/nodes/NodeDetailPanel", () => ({ NodeDetailPanel: ({ onViewObserver, onAnalyzePacket }: { onViewObserver: (id: string) => void; onAnalyzePacket: (hash: string) => void }) => <><button onClick={() => onViewObserver("observer")}>Node observer</button><button onClick={() => onAnalyzePacket("first")}>Node packet</button></> }));
vi.mock("../src/features/observers/ObserverPage", () => ({ ObserverPage: () => <h1>Observer dashboard</h1> }));
vi.mock("../src/features/packets/usePacketDetail", () => ({ usePacketDetail: (hash: string | null) => ({ data: hash ? { packetHash: hash, observations: [], header: { payloadType: 4 } } : undefined, isLoading: false }) }));
vi.mock("../src/features/packets/PacketAnalyzerOverlay", () => ({ PacketAnalyzerOverlay: ({ detail, inactive, onClose, onViewObserver }: { detail?: { packetHash: string }; inactive?: boolean; onClose: () => void; onViewObserver: (id: string) => void }) => <ModalOverlay label="Packet" onClose={onClose} inactive={inactive}><h1>{detail?.packetHash}</h1><button onClick={() => onViewObserver("observer")}>Packet observer</button></ModalOverlay> }));

vi.mock("../src/features/packets/PacketAnalyzerDrawer", () => ({ PacketAnalyzerDrawer: ({ detail, onViewObserver }: { detail?: { packetHash: string }; onViewObserver: (id: string) => void }) => <><h1>{detail?.packetHash}</h1><button onClick={() => onViewObserver("observer")}>Packet observer</button></> }));

beforeEach(() => {
  window.history.replaceState({}, "", "/?tab=Nodes&node=node-a");
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("inspecting an observer from a window", () => {
  it("leaves the node window for the observer dashboard", async () => {
    render(<App />);
    fireEvent.click(screen.getByText("Node observer"));
    expect(await screen.findByRole("heading", { name: "Observer dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("observer")).toBe("observer");
  });
});
