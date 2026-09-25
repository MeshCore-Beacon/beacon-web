import { afterEach, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useStatsObservations } from "../../../src/features/stats/useStats";
import { getStatsObservations } from "../../../src/api/client";
import { TrafficTab } from "../../../src/features/stats/TrafficTab";
import i18n from "../../../src/i18n";

const region = { iatas: ["YVR"], regionKey: "YVR", isResolved: true };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/api/client", () => ({ getStatsObservations: vi.fn(() => new Promise(() => {})) }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => <div /> }));
afterEach(() => { vi.clearAllMocks(); region.iatas = ["YVR"]; region.regionKey = "YVR"; region.isResolved = true; });

it("waits for a selected region to resolve instead of making an unfiltered request", async () => {
  region.isResolved = false;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result, unmount } = renderHook(() => useStatsObservations("24h"), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  expect(result.current.isPending).toBe(true);
  expect(getStatsObservations).not.toHaveBeenCalled();
  unmount(); client.clear();
});

it("keeps the same traffic cache entry and request when only the language changes", async () => {
  vi.mocked(getStatsObservations).mockResolvedValueOnce([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(<QueryClientProvider client={client}><TrafficTab range="7d" /></QueryClientProvider>);
  await screen.findByText("No retained receptions in this window.");
  expect(getStatsObservations).toHaveBeenCalledOnce();
  await act(() => i18n.changeLanguage("fr"));
  expect(screen.getByText("Aucune réception conservée dans cette période.")).toBeInTheDocument();
  expect(getStatsObservations).toHaveBeenCalledOnce();
  expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([["stats-observations", "YVR", "7d"]]);
  unmount(); client.clear();
});

it("cancels the old region request and uses a new cache key when filters change", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { rerender, unmount } = renderHook(() => useStatsObservations("24h"), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(getStatsObservations).toHaveBeenCalledOnce());
  const first = vi.mocked(getStatsObservations).mock.calls[0]!;
  expect(first[0]).toEqual(["YVR"]);
  expect(first[1]).toBeGreaterThan(Date.now() - 24 * 3_600_000 - 5_000);
  region.iatas = ["YOW"]; region.regionKey = "YOW"; rerender();
  await waitFor(() => expect(getStatsObservations).toHaveBeenCalledTimes(2));
  expect(first[2]?.aborted).toBe(true);
  expect(vi.mocked(getStatsObservations).mock.calls[1]?.[0]).toEqual(["YOW"]);
  unmount(); client.clear();
});
