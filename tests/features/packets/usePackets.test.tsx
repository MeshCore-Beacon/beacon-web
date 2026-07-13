import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { usePackets } from "../../../src/features/packets/usePackets";
import type { PacketSummary } from "../../../src/types/api";
import type { WsPacketObservation } from "../../../src/types/ws";

vi.mock("../../../src/hooks/useRegion", () => ({
  useRegion: () => ({ iatas: ["YOW"], regionKey: "YOW" }),
}));

const getPackets = vi.fn();
vi.mock("../../../src/api/client", () => ({
  getPackets: (...args: unknown[]) => getPackets(...args),
}));

function packet(hash: string): PacketSummary {
  return {
    packetHash: hash,
    payloadType: 4,
    payloadTypeName: "ADVERT",
    routeType: 1,
    routeTypeName: "FLOOD",
    firstHeardAt: 1,
    lastHeardAt: 1,
    observationCount: 1,
  } as PacketSummary;
}

function seedThreePages(qc: QueryClient) {
  qc.setQueryData(["packets", "YOW"], {
    pages: [
      { items: [packet("a1")], nextCursor: 200 },
      { items: [packet("b2")], nextCursor: 100 },
      { items: [packet("c3")], nextCursor: null },
    ],
    pageParams: [undefined, 200, 100],
  });
}

describe("usePackets gap healing", () => {
  let qc: QueryClient;

  beforeEach(() => {
    getPackets.mockReset();
    // nextCursor stays truthy so an invalidate would replay every cached page — the behavior under test
    getPackets.mockResolvedValue({ items: [packet("fresh")], nextCursor: 999 });
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  it("refetches only the first page on mount instead of trusting stale cached pages", async () => {
    seedThreePages(qc);
    renderHook(() => usePackets(), { wrapper });

    // the remount gap is healed with a single first-page fetch, not a 3-page replay
    await waitFor(() => expect(getPackets).toHaveBeenCalled());
    await waitFor(() => {
      const data = qc.getQueryData<{ pages: unknown[] }>(["packets", "YOW"]);
      expect(data?.pages).toHaveLength(1);
    });
    expect(getPackets).toHaveBeenCalledTimes(1);
    expect(getPackets.mock.calls[0]![1]).toEqual({ cursor: undefined });
  });

  it("resets to a single first-page fetch on a lagged notice (no page-by-page storm)", async () => {
    const { result } = renderHook(() => usePackets(), { wrapper });
    await waitFor(() => expect(getPackets).toHaveBeenCalledTimes(1));

    // simulate deep scroll state, then a lag notice
    seedThreePages(qc);
    getPackets.mockClear();
    result.current.handleLagged({ v: 1, type: "lagged", droppedCount: 5, since: 0, lastObservationId: 0 });

    await waitFor(() => expect(getPackets).toHaveBeenCalled());
    await waitFor(() => {
      const data = qc.getQueryData<{ pages: unknown[] }>(["packets", "YOW"]);
      expect(data?.pages).toHaveLength(1);
    });
    expect(getPackets).toHaveBeenCalledTimes(1);
    expect(result.current.laggedCount).toBe(5);
  });
});

function observation(hash: string): WsPacketObservation["data"] {
  return {
    packetHash: hash,
    packet: {
      payloadType: 4,
      payloadTypeName: "ADVERT",
      routeType: 1,
      routeTypeName: "FLOOD",
      isFirstObservation: true,
      observationCount: 1,
    },
    observation: {
      observerId: "o1",
      observerName: "Obs",
      iata: "YOW",
      heardAt: 1,
      rssi: -80,
      snr: 5,
      sourceBroker: "b",
    },
  };
}

describe("usePackets freeze while scrolled away", () => {
  let qc: QueryClient;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    getPackets.mockReset();
    getPackets.mockResolvedValue({ items: [], nextCursor: null });
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    rafCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  const flushRaf = () => rafCallbacks.splice(0).forEach((cb) => cb(0));

  async function mount() {
    const view = renderHook(({ frozen }) => usePackets(frozen), {
      initialProps: { frozen: false },
      wrapper,
    });
    await waitFor(() => expect(getPackets).toHaveBeenCalled());
    return view;
  }

  it("withholds live packets prepended while frozen, but still counts them", async () => {
    const { result, rerender } = await mount();

    act(() => {
      result.current.handlePacketObservation(observation("p1"));
      flushRaf();
    });
    expect(result.current.allPackets.map((p) => p.packetHash)).toEqual(["p1"]);

    rerender({ frozen: true });

    act(() => {
      result.current.handlePacketObservation(observation("p2"));
      flushRaf();
    });
    // frozen: the rendered list stays on p1; the banner still counts the held packet
    expect(result.current.allPackets.map((p) => p.packetHash)).toEqual(["p1"]);
    expect(result.current.newPacketCount).toBe(2);
  });

  it("reveals held packets once unfrozen", async () => {
    const { result, rerender } = await mount();

    act(() => {
      result.current.handlePacketObservation(observation("p1"));
      flushRaf();
    });
    rerender({ frozen: true });
    act(() => {
      result.current.handlePacketObservation(observation("p2"));
      flushRaf();
    });

    rerender({ frozen: false });
    expect(result.current.allPackets.map((p) => p.packetHash)).toEqual(["p2", "p1"]);
  });

  it("clears the new-packet count on acknowledge", async () => {
    const { result } = await mount();

    act(() => {
      result.current.handlePacketObservation(observation("p1"));
      result.current.handlePacketObservation(observation("p2"));
      flushRaf();
    });
    expect(result.current.newPacketCount).toBe(2);

    act(() => result.current.acknowledgeNewPackets());
    expect(result.current.newPacketCount).toBe(0);
  });
});
