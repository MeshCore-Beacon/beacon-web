import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { prefetchStatsTab } from "../../../src/features/stats/prefetch";
import { MeshTab } from "../../../src/features/stats/MeshTab";
import { TrafficTab } from "../../../src/features/stats/TrafficTab";
import { SignalTab } from "../../../src/features/stats/SignalTab";
import { PathsTab } from "../../../src/features/stats/PathsTab";
import { ScopesTab } from "../../../src/features/stats/ScopesTab";
import { TalkersTab } from "../../../src/features/stats/TalkersTab";
import { ClockDriftTab } from "../../../src/features/stats/ClockDriftTab";
import type { StatsTab } from "../../../src/features/stats/types";

const region = { iatas: ["YVR"], regionKey: "YVR", isResolved: true };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/api/client", () => {
  const pending = () => new Promise(() => {});
  return Object.fromEntries(
    ["getStatsSeries", "getStatsObservations", "getPayloadBreakdown", "getTopNodes", "getTopObservers", "getTopAdvertisers",
      "getTopTalkers", "getRadioPresets", "getStatsScopes", "getScopeActivity", "getStatsNodeTypes", "getClockDrift", "getSignalStats", "getPathStats"]
      .map((name) => [name, vi.fn(pending)]),
  );
});
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => null }));

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
const newClient = () => {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(c);
  return c;
};
const keys = (c: QueryClient) => c.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey)).sort();

const views: [StatsTab, ReactNode][] = [
  ["mesh", <MeshTab range="7d" onSelectObserver={() => {}} />],
  ["traffic", <TrafficTab range="7d" />],
  ["signal", <SignalTab range="7d" />],
  ["paths", <PathsTab range="7d" />],
  ["scopes", <ScopesTab range="7d" />],
  ["talkers", <TalkersTab range="7d" />],
  ["clockdrift", <ClockDriftTab />],
];

describe("prefetchStatsTab", () => {
  it.each(views)("starts exactly the requests the %s tab makes when it mounts", (tab, view) => {
    const mounted = newClient();
    render(<MemoryRouter><QueryClientProvider client={mounted}>{view}</QueryClientProvider></MemoryRouter>);
    const prefetched = newClient();
    prefetchStatsTab(prefetched, tab, "7d", { where: region.iatas, regionKey: region.regionKey, isResolved: true });
    expect(keys(prefetched)).toEqual(keys(mounted));
    expect(keys(prefetched).length).toBeGreaterThan(0);
  });

  it("waits for the selected region to resolve", () => {
    const c = newClient();
    prefetchStatsTab(c, "mesh", "7d", { where: undefined, regionKey: "pnw:pending", isResolved: false });
    expect(keys(c)).toEqual([]);
  });
});
