import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

  it("dashes a missing signal and keeps a real zero", async () => {
    mockGetObserverAdverts.mockResolvedValue({ items: [{ ...advert(1, "No signal"), snr: undefined, rssi: null }, { ...advert(2, "Zero signal"), snr: 0, rssi: 0 }], nextCursor: null, hasMore: false });
    renderAdverts();
    const stat = (name: string, label: string) => within(screen.getByRole("button", { name: new RegExp(name) })).getByText(label).nextElementSibling!;
    await screen.findByText("No signal");
    expect(stat("No signal", "SNR")).toHaveTextContent(/^—$/);
    expect(stat("No signal", "RSSI")).toHaveTextContent(/^—$/);
    expect(stat("Zero signal", "SNR")).toHaveTextContent(/^0\.00$/);
    expect(stat("Zero signal", "RSSI")).toHaveTextContent(/^0$/);
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

  it("shows an error with a retry instead of the empty state when the request fails", async () => {
    mockGetObserverAdverts.mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 503 }));
    mockGetObserverAdverts.mockResolvedValueOnce({ items: [advert(1, "Node Alpha")], nextCursor: null, hasMore: false });
    renderAdverts();
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load");
    expect(screen.queryByText("No adverts heard")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Node Alpha")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
