import { afterEach, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSignalStats } from "../../../src/features/stats/useSignalStats";
import { getSignalStats } from "../../../src/api/client";
import type { StatsRange } from "../../../src/features/stats/types";
import { SignalTab } from "../../../src/features/stats/SignalTab";
import i18n from "../../../src/i18n";

const region = { iatas: ["YVR"], regionKey: "YVR", isResolved: true };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/api/client", () => ({ getSignalStats: vi.fn(() => new Promise(() => {})) }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => <div /> }));
afterEach(() => { vi.clearAllMocks(); region.iatas = ["YVR"]; region.regionKey = "YVR"; region.isResolved = true; });

it("blocks unresolved regions and then uses bounded minute windows and cancellation", async () => {
  region.isResolved = false;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result, rerender, unmount } = renderHook(({ range }: { range: StatsRange }) => useSignalStats(range), { initialProps: { range: "24h" }, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  expect(result.current.isPending).toBe(true);
  expect(getSignalStats).not.toHaveBeenCalled();
  region.isResolved = true; rerender({ range: "24h" });
  await waitFor(() => expect(getSignalStats).toHaveBeenCalledOnce());
  const first = vi.mocked(getSignalStats).mock.calls[0]!;
  expect(first[1] % 60_000).toBe(0);
  expect(first[1] - first[0]).toBe(24 * 3_600_000);
  expect(first[2]).toEqual(["YVR"]);
  region.iatas = ["YOW"]; region.regionKey = "YOW"; rerender({ range: "30d" });
  await waitFor(() => expect(getSignalStats).toHaveBeenCalledTimes(2));
  expect(first[3]?.aborted).toBe(true);
  const second = vi.mocked(getSignalStats).mock.calls[1]!;
  expect(second[1] - second[0]).toBe(30 * 24 * 3_600_000);
  expect(second[2]).toEqual(["YOW"]);
  unmount(); expect(second[3]?.aborted).toBe(true); client.clear();
});

it("keeps the cached query and time window when only the display language changes", async () => {
  vi.mocked(getSignalStats).mockResolvedValueOnce({ since: 0, until: 3_600_000, receptions: 0,
    snr: { samples: 0, average: null, histogram: [] }, rssi: { samples: 0, average: null, histogram: [] }, hourly: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(<QueryClientProvider client={client}><SignalTab range="24h" /></QueryClientProvider>);
  await screen.findByText("No retained receptions in this window.");
  expect(getSignalStats).toHaveBeenCalledOnce();
  await act(() => i18n.changeLanguage("fr"));
  expect(screen.getByText("Aucune réception conservée dans cette période.")).toBeInTheDocument();
  expect(getSignalStats).toHaveBeenCalledOnce();
  expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([["stats-signal", "YVR", "24h"]]);
  unmount(); client.clear();
});
