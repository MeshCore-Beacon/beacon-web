import { afterEach, expect, it, vi } from "vitest";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { rolledWindow, useScopes } from "../../../src/features/stats/useStats";
import { getStatsScopes } from "../../../src/api/client";
import { ScopesTab } from "../../../src/features/stats/ScopesTab";
import i18n from "../../../src/i18n";

const region = { iatas: ["YVR"] as string[] | undefined, regionKey: "YVR", isResolved: true };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/api/client", () => ({ getStatsScopes: vi.fn(() => Promise.resolve([])), getStatsSeries: vi.fn(() => Promise.resolve({ hours: [] })) }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => <div /> }));
afterEach(() => { vi.clearAllMocks(); region.iatas = ["YVR"]; region.regionKey = "YVR"; region.isResolved = true; });

it("sends the selected IATAs and fetches a separate global query when the filter is cleared", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { rerender, unmount } = renderHook(() => useScopes("7d"), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(getStatsScopes).toHaveBeenCalledWith(["YVR"], expect.any(Number), expect.any(AbortSignal)));
  region.iatas = undefined; region.regionKey = "*"; rerender();
  await waitFor(() => expect(getStatsScopes).toHaveBeenCalledWith(undefined, expect.any(Number), expect.any(AbortSignal)));
  expect(client.getQueryCache().findAll({ queryKey: ["stats-scopes"] })).toHaveLength(2);
  unmount(); client.clear();
});

it("does not fetch a global fallback for unresolved selected regions", () => {
  region.isResolved = false;
  const client = new QueryClient();
  const { unmount } = renderHook(() => useScopes("7d"), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  expect(getStatsScopes).not.toHaveBeenCalled();
  unmount(); client.clear();
});

it("reuses the regional query when only the language changes", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(<QueryClientProvider client={client}><ScopesTab range="7d" /></QueryClientProvider>);
  await screen.findByText("No scope data available.");
  expect(getStatsScopes).toHaveBeenCalledOnce();
  await act(() => i18n.changeLanguage("fr"));
  expect(screen.getByText("Aucune donnée de scope disponible.")).toBeInTheDocument();
  expect(getStatsScopes).toHaveBeenCalledOnce();
  expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([["stats-scopes", "YVR", "7d"], ["stats-series", "YVR", "7d"]]);
  unmount(); client.clear();
});

it("windows scope counts like the series, from the same rolled hour", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 0, 2, 12, 10));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = renderHook(() => useScopes("24h"), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(getStatsScopes).toHaveBeenCalledOnce());
  expect(vi.mocked(getStatsScopes).mock.calls[0]![1]).toBe(rolledWindow("24h").since);
  expect(rolledWindow("24h").since).toBe(Date.UTC(2026, 0, 1, 11));
  unmount(); client.clear(); vi.useRealTimers();
});
