import { afterEach, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as client from "../../../src/api/client";
import {
  usePayloadBreakdown, useTopNodes, useTopObservers, useTopAdvertisers, useTopTalkers, useRadioPresets, useNodeTypes, useClockDrift,
} from "../../../src/features/stats/useStats";

const region = { iatas: undefined as string[] | undefined, regionKey: "west", isResolved: false };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/api/client", () => {
  const empty = () => vi.fn(() => Promise.resolve([]));
  return {
    getPayloadBreakdown: empty(), getTopNodes: empty(), getTopObservers: empty(), getTopAdvertisers: empty(),
    getTopTalkers: empty(), getRadioPresets: empty(), getStatsNodeTypes: empty(), getClockDrift: empty(),
  };
});
afterEach(() => vi.clearAllMocks());

const hooks = [
  ["usePayloadBreakdown", () => usePayloadBreakdown("24h"), client.getPayloadBreakdown],
  ["useTopNodes", () => useTopNodes("24h"), client.getTopNodes],
  ["useTopObservers", () => useTopObservers("24h"), client.getTopObservers],
  ["useTopAdvertisers", () => useTopAdvertisers("24h", "flood"), client.getTopAdvertisers],
  ["useTopTalkers", () => useTopTalkers("24h"), client.getTopTalkers],
  ["useRadioPresets", () => useRadioPresets(), client.getRadioPresets],
  ["useNodeTypes", () => useNodeTypes(), client.getStatsNodeTypes],
  ["useClockDrift", () => useClockDrift(), client.getClockDrift],
] as const;

it.each(hooks)("%s waits for the selected region instead of fetching every IATA", async (_name, hook, fetcher) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result, unmount } = renderHook(hook, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
  await Promise.resolve();
  expect(fetcher).not.toHaveBeenCalled();
  expect(result.current.fetchStatus).toBe("idle");
  unmount(); queryClient.clear();
});
