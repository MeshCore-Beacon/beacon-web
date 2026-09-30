import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { App } from "../src/App";
import type { PacketSummary, PacketDetail } from "../src/types/api";

// Full-app wiring test for the App.tsx <-> PacketExpansion <-> PacketAnalyzerDrawer coupling.
// Everything below the tab shell is real; only the network boundary and the virtualizer (needs
// layout/ResizeObserver jsdom doesn't have) are faked.

vi.mock("../src/api/ws-manager", () => {
  class WsManager {
    connect() {}
    disconnect() {}
    updateSubscription() {}
    onPacketObservation() { return () => {}; }
    onLagged() { return () => {}; }
    onChannelMessage() { return () => {}; }
    onObserverStatus() { return () => {}; }
    onNodeUpdate() { return () => {}; }
    onStatusChange() { return () => {}; }
    getStatus() { return "disconnected"; }
    getLastEventTimestamp() { return Date.now(); }
  }
  return { WsManager };
});

vi.mock("../src/api/client", () => ({
  getRegions: async () => [],
  getRegion: async () => ({ id: 0, slug: "", displayName: "", iatas: [] }),
  getIatas: async () => [],
  getScopes: async () => [],
}));

const packet: PacketSummary = {
  packetHash: "AA11", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 1700000000000, lastHeardAt: 1700000002000, observationCount: 3,
};

const detail = {
  packetHash: "AA11",
  header: { raw: "12", routeType: 1, routeTypeName: "FLOOD", payloadType: 1, payloadTypeName: "ADVERT", payloadVersion: 1 },
  firstHeardAt: 1700000000000, lastHeardAt: 1700000002000, firstToLastMs: 2000, observationCount: 3,
  rawPayload: "", decrypted: false,
  observations: [
    { id: 1, observerId: "obs1", observerName: "Observer One", iata: "YOW", heardAt: 1700000000000, sourceBroker: "b1", pathLength: { raw: "00", hashSize: 1, hopCount: 0 }, resolvedPath: [] },
    { id: 2, observerId: "obs2", observerName: "Observer Two", iata: "YVR", heardAt: 1700000001000, sourceBroker: "b1", pathLength: { raw: "00", hashSize: 1, hopCount: 0 }, resolvedPath: [] },
    { id: 3, observerId: "obs3", observerName: "Observer Three", iata: "YYZ", heardAt: 1700000002000, sourceBroker: "b1", pathLength: { raw: "00", hashSize: 1, hopCount: 0 }, resolvedPath: [] },
  ],
} as unknown as PacketDetail;

vi.mock("../src/features/packets/usePackets", () => ({
  usePackets: () => ({
    allPackets: [packet],
    observerOptions: [],
    newPacketCount: 0,
    acknowledgeNewPackets: () => {},
    fetchNextPage: () => {},
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    isError: false,
    observersByHash: new Map(),
    handlePacketObservation: () => {},
    handleLagged: () => {},
    laggedCount: 0,
    dismissLagged: () => {},
  }),
}));

vi.mock("../src/features/packets/usePacketDetail", () => ({
  usePacketDetail: (hash: string | null) => ({
    data: hash === "AA11" ? detail : undefined,
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
}));

interface MockVirtualListProps {
  packets: PacketSummary[];
  expandedHash: string | null;
  onToggleExpand: (hash: string) => void;
  onOpenAnalyzer: () => void;
  onViewPath: () => void;
  selectedObservationId: number | null;
  onSelectObservation: (id: number) => void;
}

// Stands in for the virtualizer while keeping the real PacketExpansion mounted, so the row-select
// -> Open analyzer path under test is genuine, not reimplemented in the test.
vi.mock("../src/features/packets/PacketVirtualList", async () => {
  const { PacketExpansion } = await import("../src/features/packets/PacketExpansion");
  return {
    PacketVirtualList: ({ packets, expandedHash, onToggleExpand, onOpenAnalyzer, onViewPath, selectedObservationId, onSelectObservation }: MockVirtualListProps) => (
      <div>
        {packets.map((p) => (
          <div key={p.packetHash}>
            <button type="button" onClick={() => onToggleExpand(p.packetHash)}>{p.packetHash}</button>
            {expandedHash === p.packetHash && (
              <PacketExpansion
                packet={p}
                onOpenAnalyzer={onOpenAnalyzer}
                onViewPath={onViewPath}
                selectedObservationId={selectedObservationId}
                onSelectObservation={onSelectObservation}
              />
            )}
          </div>
        ))}
      </div>
    ),
  };
});

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  window.history.pushState({}, "", "/?tab=Packets");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("opening the analyzer from an expanded row", () => {
  // Regression: handleAnalyze used to reset selectedObservationId on every open, so picking an
  // observation inside the expanded row landed the analyzer on observations[0] instead of the one
  // clicked. Selecting an observation is now what opens the analyzer, so the two happen together.
  it("keeps the observation selected in the expanded row", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "AA11" }));
    fireEvent.click(await screen.findByText("Observer Three"));

    const drawer = await screen.findByTestId("packet-analyzer-drawer");
    expect(within(drawer).getByRole("button", { name: "Inspect report: Observer Three" })).toHaveAttribute("aria-pressed", "true");
  });
});

it("replaces a shared observation when another report is selected in the row", async () => {
  window.history.replaceState({}, "", "/?tab=Packets&hash=AA11&observation=3");
  render(<App />);
  fireEvent.click(await screen.findByText("Observer Two"));
  const drawer = await screen.findByTestId("packet-analyzer-drawer");
  expect(within(drawer).getByRole("button", { name: "Inspect report: Observer Two" })).toHaveAttribute("aria-pressed", "true");
  expect(new URLSearchParams(window.location.search).get("observation")).toBe("2");
});
