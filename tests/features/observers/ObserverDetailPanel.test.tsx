import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ObserverDetailPanel } from "../../../src/features/observers/ObserverDetailPanel";
import { getObserver, getObserverAdverts } from "../../../src/api/client";
import type { Observer, AdvertObservation } from "../../../src/features/observers/types";

vi.mock("../../../src/api/client", () => ({
  getObserver: vi.fn(),
  getObserverAdverts: vi.fn(),
}));

const mockGetObserver = vi.mocked(getObserver);
const mockGetObserverAdverts = vi.mocked(getObserverAdverts);

const observer: Observer = {
  id: "obs-1",
  iata: "YVR",
  status: "online",
  publicKey: "aabbccddeeff",
  firstSeen: 1,
  lastSeen: 2,
  observationCount: 10,
  brokers: [],
};

function advert(id: number, nodeName: string): AdvertObservation {
  return {
    id,
    packetHash: `hash-${id}`,
    payloadType: 4,
    payloadTypeName: "ADVERT",
    iata: "YVR",
    heardAt: 1000,
    snr: 7.5,
    rssi: -90,
    hopCount: 0,
    nodeName,
    nodePublicKey: "1122334455",
  };
}

function renderPanel(onAnalyzePacket = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<ObserverDetailPanel observerId="obs-1" onClose={vi.fn()} onAnalyzePacket={onAnalyzePacket} />, { wrapper });
  return { onAnalyzePacket };
}

beforeEach(() => {
  mockGetObserver.mockReset();
  mockGetObserverAdverts.mockReset();
  mockGetObserver.mockResolvedValue(observer);
  mockGetObserverAdverts.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
});

describe("ObserverDetailPanel status", () => {
  it("renders offline when lastStatusAt is 10 minutes old even if the API status says online", async () => {
    mockGetObserver.mockResolvedValue({ ...observer, status: "online", lastStatusAt: Date.now() - 10 * 60_000 });

    renderPanel();

    expect(await screen.findByText("offline")).toBeInTheDocument();
    expect(screen.queryByText("online")).not.toBeInTheDocument();
  });

  it("renders online when lastStatusAt is fresh", async () => {
    mockGetObserver.mockResolvedValue({ ...observer, status: "online", lastStatusAt: Date.now() - 60_000 });

    renderPanel();

    expect(await screen.findByText("online")).toBeInTheDocument();
  });
});

describe("ObserverDetailPanel adverts", () => {
  it("lists adverts heard by the observer", async () => {
    mockGetObserverAdverts.mockResolvedValue({
      items: [advert(1, "Node Alpha"), advert(2, "Node Beta")],
      nextCursor: null,
      hasMore: false,
    });

    renderPanel();

    expect(await screen.findByText("Adverts heard")).toBeInTheDocument();
    expect(await screen.findByText("Node Alpha")).toBeInTheDocument();
    expect(screen.getByText("Node Beta")).toBeInTheDocument();
    expect(mockGetObserverAdverts).toHaveBeenCalledWith("obs-1", { limit: 50 });
  });

  it("analyzes the packet when an advert row is clicked", async () => {
    mockGetObserverAdverts.mockResolvedValue({
      items: [advert(1, "Node Alpha")],
      nextCursor: null,
      hasMore: false,
    });

    const { onAnalyzePacket } = renderPanel();

    fireEvent.click(await screen.findByText("Node Alpha"));
    expect(onAnalyzePacket).toHaveBeenCalledWith("hash-1");
  });
});
