import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ObserverAdverts } from "../../../src/features/observers/ObserverAdverts";
import { getObserverAdverts } from "../../../src/api/client";
import type { AdvertObservation } from "../../../src/features/observers/types";

vi.mock("../../../src/api/client", () => ({ getObserverAdverts: vi.fn() }));
const mockGetObserverAdverts = vi.mocked(getObserverAdverts);

function advert(id: number, nodeName: string): AdvertObservation {
  return { id, packetHash: `hash-${id}`, payloadType: 4, payloadTypeName: "ADVERT", iata: "YVR", heardAt: 1000, snr: 7.5, rssi: -90, hopCount: 0, nodeName, nodePublicKey: "1122334455" };
}

function renderAdverts(onAnalyzePacket = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ObserverAdverts observerId="obs-1" onAnalyzePacket={onAnalyzePacket} /></QueryClientProvider>);
  return { onAnalyzePacket };
}

beforeEach(() => mockGetObserverAdverts.mockReset());

describe("ObserverAdverts", () => {
  it("lists adverts heard by the observer", async () => {
    mockGetObserverAdverts.mockResolvedValue({ items: [advert(1, "Node Alpha"), advert(2, "Node Beta")], nextCursor: null, hasMore: false });
    renderAdverts();
    expect(screen.getByText("Adverts heard")).toBeInTheDocument();
    expect(await screen.findByText("Node Alpha")).toBeInTheDocument();
    expect(screen.getByText("Node Beta")).toBeInTheDocument();
    expect(mockGetObserverAdverts).toHaveBeenCalledWith("obs-1", { limit: 50 });
  });

  it("analyzes the packet when an advert is clicked", async () => {
    mockGetObserverAdverts.mockResolvedValue({ items: [advert(1, "Node Alpha")], nextCursor: null, hasMore: false });
    const { onAnalyzePacket } = renderAdverts();
    fireEvent.click(await screen.findByRole("button", { name: /Node Alpha/ }));
    expect(onAnalyzePacket).toHaveBeenCalledWith("hash-1", 1);
  });

  it("says when no adverts were heard", async () => {
    mockGetObserverAdverts.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    renderAdverts();
    expect(await screen.findByText("No adverts heard")).toBeInTheDocument();
  });
});
