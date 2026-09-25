import { afterEach, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { usePathStats } from "../../../src/features/stats/usePathStats";
import { getPathStats } from "../../../src/api/client";
import type { StatsRange } from "../../../src/features/stats/types";
import { PathsTab } from "../../../src/features/stats/PathsTab";
import i18n from "../../../src/i18n";

const region = { iatas: ["YVR"], regionKey: "YVR", isResolved: true };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/api/client", () => ({ getPathStats: vi.fn(() => new Promise(() => {})) }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => <div /> }));
afterEach(() => { vi.clearAllMocks(); region.iatas = ["YVR"]; region.regionKey = "YVR"; region.isResolved = true; });

it("blocks unresolved regions and then uses bounded minute windows and cancellation", async () => {
  region.isResolved = false;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result, rerender, unmount } = renderHook(({ range }: { range: StatsRange }) => usePathStats(range), { initialProps: { range: "24h" }, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  expect(result.current.isPending).toBe(true);
  expect(getPathStats).not.toHaveBeenCalled();
  region.isResolved = true; rerender({ range: "24h" });
  await waitFor(() => expect(getPathStats).toHaveBeenCalledOnce());
  const first = vi.mocked(getPathStats).mock.calls[0]!;
  expect(first[1] % 60_000).toBe(0);
  expect(first[1] - first[0]).toBe(24 * 3_600_000);
  expect(first[2]).toEqual(["YVR"]);
  region.iatas = ["YOW"]; region.regionKey = "YOW"; rerender({ range: "30d" });
  await waitFor(() => expect(getPathStats).toHaveBeenCalledTimes(2));
  expect(first[3]?.aborted).toBe(true);
  const second = vi.mocked(getPathStats).mock.calls[1]!;
  expect(second[1] - second[0]).toBe(30 * 24 * 3_600_000);
  expect(second[2]).toEqual(["YOW"]);
  unmount(); expect(second[3]?.aborted).toBe(true); client.clear();
});

it("retains the same cached path request and window when only the language changes", async () => {
  vi.mocked(getPathStats).mockResolvedValueOnce({ since: 0, until: 3_600_000, receptions: 0,
    hashed: 0, empty: 0, trace: 0, unclassified: 0, hashWidths: [], pathLengths: [], hourly: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(<QueryClientProvider client={client}><PathsTab range="7d" /></QueryClientProvider>);
  await screen.findByText("No retained receptions in this window.");
  expect(getPathStats).toHaveBeenCalledOnce();
  await act(() => i18n.changeLanguage("fr"));
  expect(screen.getByText("Aucune réception conservée dans cette période.")).toBeInTheDocument();
  expect(getPathStats).toHaveBeenCalledOnce();
  expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([["stats-paths", "YVR", "7d"]]);
  unmount(); client.clear();
});
