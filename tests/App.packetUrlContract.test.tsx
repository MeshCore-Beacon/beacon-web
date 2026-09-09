import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { App } from "../src/App";
import type { PacketSummary, PacketDetail } from "../src/types/api";

// The Packets tab's URL contract, exercised through a real App: ?hash expands a row, ?analyze=1 adds
// the drawer on top of it, and a mobile tab change leaves neither behind. Only the network boundary
// and the virtualizer (needs layout/ResizeObserver jsdom doesn't have) are faked.

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
  getChannels: async () => [],
  getChannelMessagesPage: async () => ({ items: [], nextCursor: null, hasMore: false }),
}));

const packet: PacketSummary = {
  packetHash: "AA11", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 1700000000000, lastHeardAt: 1700000002000, observationCount: 1,
};

const detail = {
  packetHash: "AA11",
  header: { raw: "12", routeType: 1, routeTypeName: "FLOOD", payloadType: 1, payloadTypeName: "ADVERT", payloadVersion: 1 },
  firstHeardAt: 1700000000000, lastHeardAt: 1700000002000, firstToLastMs: 2000, observationCount: 1,
  rawPayload: "", decrypted: false,
  observations: [
    { id: 1, observerId: "obs1", observerName: "Observer One", iata: "YOW", heardAt: 1700000000000, sourceBroker: "b1", pathLength: { raw: "00", hashSize: 1, hopCount: 0 }, resolvedPath: [] },
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
    data: hash === "AA11" ? detail : hash === "BB22" ? { ...detail, packetHash: "BB22" } : undefined,
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

// Stands in for the virtualizer while keeping the real PacketExpansion mounted, so what ?hash
// expands is the genuine component and not a test stub.
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

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: /max-width/.test(query) ? matches : /hover/.test(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Packets deep links", () => {
  it.each([false, true])("opens an unloaded selection explicitly and preserves region and filters (mobile=%s)", async (mobile) => {
    setMobile(mobile);
    window.history.pushState({}, "", "/?tab=Packets&hash=BB22&iata=YOW&q=missing");
    render(<App />);
    const notice = await screen.findByRole("region", { name: "Selected packet" });
    expect(screen.queryByTestId("packet-analyzer-drawer")).not.toBeInTheDocument();
    fireEvent.click(within(notice).getByRole("button", { name: "Open analyzer" }));
    expect(screen.getByTestId("packet-analyzer-drawer")).toHaveTextContent("BB22");
    expect(screen.queryByRole("region", { name: "Selected packet" })).not.toBeInTheDocument();
    const params = new URLSearchParams(window.location.search);
    expect(params.get("analyze")).toBe("1");
    expect(params.get("hash")).toBe("BB22");
    expect(params.get("iata")).toBe("YOW");
    expect(params.get("q")).toBe("missing");
    fireEvent.click(screen.getByRole("button", { name: "Close analyzer" }));
    expect(screen.getByRole("region", { name: "Selected packet" })).toBeInTheDocument();
  });

  it("updates the selection notice on URL navigation", async () => {
    window.history.pushState({}, "", "/?tab=Packets&hash=BB22");
    render(<App />);
    expect(await screen.findByRole("region", { name: "Selected packet" })).toBeInTheDocument();
    act(() => {
      window.history.pushState({}, "", "/?tab=Packets&hash=AA11");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.queryByRole("region", { name: "Selected packet" })).not.toBeInTheDocument();
    expect(screen.getByTestId("packet-expansion")).toBeInTheDocument();
  });

  it("restores the expanded row and the drawer from ?hash&analyze=1", async () => {
    window.history.pushState({}, "", "/?tab=Packets&hash=AA11&analyze=1");
    render(<App />);

    expect(await screen.findByTestId("packet-expansion")).toBeInTheDocument();
    expect(screen.getByTestId("packet-analyzer-drawer")).toBeInTheDocument();
  });

  it("expands the row without the drawer from ?hash alone", async () => {
    window.history.pushState({}, "", "/?tab=Packets&hash=AA11");
    render(<App />);

    expect(await screen.findByTestId("packet-expansion")).toBeInTheDocument();
    expect(screen.queryByTestId("packet-analyzer-drawer")).not.toBeInTheDocument();
  });

  it("opens nothing when ?analyze=1 arrives without a hash", async () => {
    window.history.pushState({}, "", "/?tab=Packets&analyze=1");
    render(<App />);

    expect(await screen.findByRole("button", { name: "AA11" })).toBeInTheDocument();
    expect(screen.queryByTestId("packet-expansion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("packet-analyzer-drawer")).not.toBeInTheDocument();
  });
});

describe("leaving the Packets tab", () => {
  // The drawer is full-screen below md, and it renders on Channels too — so a mobile tab change has
  // to drop ?analyze or the analyzer covers the tab the user just asked for.
  it("closes the analyzer on mobile", async () => {
    setMobile(true);
    window.history.pushState({}, "", "/?tab=Packets&hash=AA11&analyze=1");
    render(<App />);
    expect(await screen.findByTestId("packet-analyzer-drawer")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("tab", { name: "Channels" })[0]!);

    expect(screen.queryByTestId("packet-analyzer-drawer")).not.toBeInTheDocument();
  });

  it("keeps the analyzer open on desktop", async () => {
    setMobile(false);
    window.history.pushState({}, "", "/?tab=Packets&hash=AA11&analyze=1");
    render(<App />);
    expect(await screen.findByTestId("packet-analyzer-drawer")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("tab", { name: "Channels" })[0]!);

    expect(screen.getByTestId("packet-analyzer-drawer")).toBeInTheDocument();
  });
});
