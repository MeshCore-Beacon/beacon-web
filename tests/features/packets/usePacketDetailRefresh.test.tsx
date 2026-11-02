import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePacketDetail } from "../../../src/features/packets/usePacketDetail";
import { usePacketDetailRefresh } from "../../../src/features/packets/usePacketDetailRefresh";
import type { PacketDetail } from "../../../src/types/api";

const getPacketDetail = vi.fn();
vi.mock("../../../src/api/client", () => ({
  getPacketDetail: (hash: string) => getPacketDetail(hash),
}));

const T0 = new Date("2026-10-26T12:00:00Z").getTime();
let starts: { hash: string; at: number }[] = [];

function view(initialHash: string | null = "aa11") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  // stands in for the expanded row: it holds the detail query and reports observations
  const hook = renderHook(({ hash }: { hash: string | null }) => {
    usePacketDetail(hash);
    return usePacketDetailRefresh(hash);
  }, { wrapper, initialProps: { hash: initialHash } });
  return { ...hook, queryClient, invalidate };
}

const requests = (hash = "aa11") => starts.filter((s) => s.hash === hash).length;
const elapsed = (hash = "aa11") => starts.filter((s) => s.hash === hash).map((s) => s.at - T0);
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const detailFor = (hash: string, tag = "") => ({ packetHash: hash, observations: [], tag }) as unknown as PacketDetail;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  starts = [];
  getPacketDetail.mockReset();
  getPacketDetail.mockImplementation(async (hash: string) => {
    starts.push({ hash, at: Date.now() });
    return detailFor(hash);
  });
});

afterEach(() => vi.useRealTimers());

describe("usePacketDetailRefresh", () => {
  it("refetches a burst of observations once, at the 5 s mark", async () => {
    const { result } = view();
    await advance(0);
    expect(requests()).toBe(1);

    for (let i = 0; i < 10; i++) {
      act(() => result.current("aa11"));
      await advance(300);
    }
    await advance(1_999);
    expect(requests()).toBe(1);

    await advance(1);
    expect(elapsed()).toEqual([0, 5_000]);

    await advance(20_000);
    expect(requests()).toBe(2);
  });

  it("refetches about once per 5 s while observations keep coming", async () => {
    const { result } = view();
    await advance(0);

    for (let s = 1; s <= 12; s++) {
      await advance(1_000);
      act(() => result.current("aa11"));
    }
    // two requests in any 10 s, and the last observation still gets its trailing refetch
    expect(elapsed()).toEqual([0, 5_000, 10_000]);
    await advance(3_000);
    expect(elapsed()).toEqual([0, 5_000, 10_000, 15_000]);
    await advance(20_000);
    expect(requests()).toBe(4);
  });

  it("refetches straight away when the last fetch began 5 s or more ago", async () => {
    const { result } = view();
    await advance(8_000);

    act(() => result.current("aa11"));
    expect(elapsed()).toEqual([0, 8_000]);
  });

  it("leaves the detail alone for observations on other packets", async () => {
    const { result, invalidate } = view();
    await advance(0);

    act(() => result.current("bb22"));
    await advance(10_000);
    expect(invalidate).not.toHaveBeenCalled();
    expect(getPacketDetail).toHaveBeenCalledTimes(1);
  });

  it("does nothing while no row is open", async () => {
    const { result, invalidate } = view(null);

    act(() => result.current("aa11"));
    await advance(10_000);
    expect(invalidate).not.toHaveBeenCalled();
    expect(getPacketDetail).not.toHaveBeenCalled();
  });

  it("drops the pending refetch when the row collapses", async () => {
    const { result, rerender, invalidate } = view();
    await advance(0);

    act(() => result.current("aa11"));
    rerender({ hash: null });
    await advance(10_000);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("drops the pending refetch on unmount", async () => {
    const { result, unmount, invalidate } = view();
    await advance(0);

    act(() => result.current("aa11"));
    unmount();
    await advance(10_000);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("starts a fresh window for a newly opened hash", async () => {
    const { result, rerender, invalidate } = view();
    await advance(0);
    act(() => result.current("aa11"));
    await advance(3_000);

    rerender({ hash: "bb22" });
    await advance(0);
    act(() => result.current("aa11"));
    act(() => result.current("bb22"));

    await advance(4_999);
    expect(elapsed("bb22")).toEqual([3_000]);
    await advance(1);
    expect(elapsed("bb22")).toEqual([3_000, 8_000]);
    expect(elapsed("aa11")).toEqual([0]);
    expect(invalidate.mock.calls.some(([filters]) => filters?.queryKey?.[1] === "aa11")).toBe(false);
  });

  it("lets an in-flight fetch finish, then refetches for what arrived during it", async () => {
    const finish: ((detail: PacketDetail) => void)[] = [];
    getPacketDetail.mockImplementation((hash: string) => {
      starts.push({ hash, at: Date.now() });
      if (starts.length === 1) return Promise.resolve(detailFor(hash, "first"));
      return new Promise<PacketDetail>((resolve) => finish.push(resolve));
    });
    const { result, queryClient } = view();
    await advance(0);

    act(() => result.current("aa11"));
    await advance(5_000);
    expect(elapsed()).toEqual([0, 5_000]);

    // heard again while the slow refetch is still downloading
    await advance(1_000);
    act(() => result.current("aa11"));
    await advance(6_000);
    act(() => result.current("aa11"));
    expect(elapsed()).toEqual([0, 5_000]);

    await act(async () => {
      finish[0](detailFor("aa11", "second"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(queryClient.getQueryData<{ tag: string }>(["packet-detail", "aa11"])?.tag).toBe("second");
    expect(elapsed()).toEqual([0, 5_000, 12_000]);

    await act(async () => {
      finish[1](detailFor("aa11", "third"));
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(queryClient.getQueryData<{ tag: string }>(["packet-detail", "aa11"])?.tag).toBe("third");
    expect(requests()).toBe(3);
  });
});
