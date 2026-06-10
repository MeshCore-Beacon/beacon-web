import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { usePackets } from "../../../src/features/packets/usePackets";
import type { PacketSummary } from "../../../src/types/api";

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
