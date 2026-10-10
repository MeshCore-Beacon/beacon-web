import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TalkersTab } from "../../../src/features/stats/TalkersTab";
import { getTopAdvertisers, getTopTalkers } from "../../../src/api/client";
import type { StatsRange, TopAdvertiser, TopTalker } from "../../../src/features/stats/types";
import type { EChartsOption } from "../../../src/features/stats/echarts-setup";
import i18n from "../../../src/i18n";

const region = { iatas: ["YVR"], regionKey: "YVR" };
const advertisers: TopAdvertiser[] = [{ nodeId: "fixture-node", publicKey: "aa11bb22cc33dd44", nodeName: "Old advertiser", nodeType: 2, nodeTypeName: "Repeater", iata: "YVR", advertCount: 14, floodAdvertCount: 10, directAdvertCount: 4, lastHeard: 0 }];
const talkers: TopTalker[] = [{ senderName: "Old sender", messageCount: 42, lastSent: 0 }];
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/api/client", () => ({ getTopAdvertisers: vi.fn(), getTopTalkers: vi.fn() }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: ({ option }: { option: EChartsOption }) => {
  const axis = Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis;
  return <div data-testid="leaderboard">{axis?.data?.map(String).join(" ")}</div>;
} }));

const clients: QueryClient[] = [];
beforeEach(() => {
  vi.clearAllMocks(); region.iatas = ["YVR"]; region.regionKey = "YVR";
  vi.mocked(getTopAdvertisers).mockReset().mockResolvedValue(advertisers);
  vi.mocked(getTopTalkers).mockReset().mockResolvedValue(talkers);
});
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function mount(onViewNode?: (id: string) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = (range: StatsRange) => <QueryClientProvider client={client}><TalkersTab range={range} onViewNode={onViewNode} /></QueryClientProvider>;
  const result = render(view("24h"));
  return { client, rerender: (range: StatsRange) => result.rerender(view(range)) };
}

it.each(["region", "range"] as const)("hides previous results while the new %s is pending, then shows each resolved panel", async (filter) => {
  const { rerender } = mount();
  await screen.findByText("Old advertiser"); await screen.findByText("Old sender");
  const nextAdvertisers = deferred<TopAdvertiser[]>(), nextTalkers = deferred<TopTalker[]>();
  vi.mocked(getTopAdvertisers).mockReturnValue(nextAdvertisers.promise);
  vi.mocked(getTopTalkers).mockReturnValue(nextTalkers.promise);
  if (filter === "region") { region.iatas = ["YOW"]; region.regionKey = "YOW"; }
  const requestedAt = Date.now();
  rerender(filter === "range" ? "7d" : "24h");
  await waitFor(() => expect(getTopAdvertisers).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Old advertiser")).not.toBeInTheDocument();
  expect(screen.queryByText("Old sender")).not.toBeInTheDocument();
  expect(screen.queryByTestId("leaderboard")).not.toBeInTheDocument();
  await act(() => nextAdvertisers.resolve([{ ...advertisers[0]!, nodeName: "New advertiser" }]));
  await screen.findByText("New advertiser");
  expect(screen.queryByTestId("leaderboard")).not.toBeInTheDocument();
  await act(() => nextTalkers.resolve([{ ...talkers[0]!, senderName: "New sender" }]));
  await screen.findByText("New sender");
  const request = vi.mocked(getTopAdvertisers).mock.calls[1]!;
  expect(request[0]).toEqual(filter === "region" ? ["YOW"] : ["YVR"]);
  expect(request[2]).toBe("flood");
  expect(request[3]).toBe(20);
  const windowMs = (filter === "range" ? 7 : 1) * 86_400_000;
  expect(request[1]).toBeGreaterThanOrEqual(requestedAt - windowMs);
  expect(request[1]).toBeLessThanOrEqual(Date.now() - windowMs);
});

it("shows an advertiser refetch error instead of cached rows, keeps the sender panel, and recovers", async () => {
  const { client } = mount();
  await screen.findByText("Old advertiser"); await screen.findByText("Old sender");
  vi.mocked(getTopAdvertisers).mockRejectedValue(new Error("controlled advertiser failure"));
  await act(() => client.refetchQueries({ queryKey: ["stats-top-advertisers"] }));
  await screen.findByText("Failed to load");
  expect(screen.queryByText("Old advertiser")).not.toBeInTheDocument();
  expect(screen.getByText("Old sender")).toBeInTheDocument();
  expect(client.getQueryData(["stats-top-advertisers", "YVR", "24h", "flood", 20])).toEqual(advertisers);
  vi.mocked(getTopAdvertisers).mockResolvedValue([{ ...advertisers[0]!, nodeName: "Recovered advertiser" }]);
  await act(() => client.refetchQueries({ queryKey: ["stats-top-advertisers"] }));
  await screen.findByText("Recovered advertiser");
  expect(screen.queryByText("Failed to load")).not.toBeInTheDocument();
  expect(getTopTalkers).toHaveBeenCalledOnce();
});

it("keeps advertisers usable when only the sender request fails", async () => {
  const { client } = mount();
  await screen.findByText("Old advertiser"); await screen.findByText("Old sender");
  vi.mocked(getTopTalkers).mockRejectedValue(new Error("controlled sender failure"));
  await act(() => client.refetchQueries({ queryKey: ["stats-top-talkers"] }));
  await screen.findByText("Failed to load");
  expect(screen.queryByText("Old sender")).not.toBeInTheDocument();
  expect(screen.getByText("Old advertiser")).toBeInTheDocument();
  expect(getTopAdvertisers).toHaveBeenCalledOnce();
});

it("retains valid rows and rates during an ordinary background refresh", async () => {
  // past :35 the rolled window is a full 24h
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 2, 12, 40));
  onTestFinished(() => { vi.useRealTimers(); });
  const { client } = mount();
  await screen.findByText("Old advertiser"); await screen.findByText("Old sender");
  const next = deferred<TopAdvertiser[]>();
  vi.mocked(getTopAdvertisers).mockReturnValue(next.promise);
  let refresh!: Promise<void>;
  await act(async () => { refresh = client.refetchQueries({ queryKey: ["stats-top-advertisers"] }); });
  expect(client.getQueryState(["stats-top-advertisers", "YVR", "24h", "flood", 20])?.fetchStatus).toBe("fetching");
  expect(screen.getByText("Old advertiser")).toBeInTheDocument();
  expect(screen.getByText("10/d")).toBeInTheDocument();
  expect(screen.getByText("4/d")).toBeInTheDocument();
  expect(screen.getByText("Old sender")).toBeInTheDocument();
  await act(async () => { next.resolve([{ ...advertisers[0]!, nodeName: "Fresh advertiser" }]); await refresh; });
  await screen.findByText("Fresh advertiser");
});

it("distinguishes initial loading from successful empty results", async () => {
  const nextAdvertisers = deferred<TopAdvertiser[]>(), nextTalkers = deferred<TopTalker[]>();
  vi.mocked(getTopAdvertisers).mockReturnValue(nextAdvertisers.promise);
  vi.mocked(getTopTalkers).mockReturnValue(nextTalkers.promise);
  mount();
  expect(screen.queryByText("No advertisers")).not.toBeInTheDocument();
  expect(screen.queryByTestId("leaderboard")).not.toBeInTheDocument();
  await act(() => { nextAdvertisers.resolve([]); nextTalkers.resolve([]); });
  await screen.findByText("No advertisers");
  expect(screen.getByText("No data")).toBeInTheDocument();
});

it("opens the clicked advertiser's node", async () => {
  const onViewNode = vi.fn();
  mount(onViewNode);
  fireEvent.click(await screen.findByText("Old advertiser"));
  expect(onViewNode).toHaveBeenCalledWith("fixture-node");
});

it("lists a deleted node by public key without opening it", async () => {
  vi.mocked(getTopAdvertisers).mockResolvedValue([...advertisers, { ...advertisers[0]!, nodeId: null, publicKey: "deadbeef00112233", nodeName: null }]);
  const onViewNode = vi.fn();
  mount(onViewNode);
  fireEvent.click(await screen.findByText("deadbeef"));
  expect(onViewNode).not.toHaveBeenCalled();
});

it("renders the leaderboards in French", async () => {
  await i18n.changeLanguage("fr");
  mount();
  await screen.findByText("Old advertiser");
  expect(screen.getByText("Principaux annonceurs · 24 h")).toBeInTheDocument();
  expect(screen.getByText("Principaux émetteurs · 24 h")).toBeInTheDocument();
  expect(screen.getByText("Nœud")).toBeInTheDocument();
});

it("divides advert rates by the hours the rollup actually covers", async () => {
  // at 12:10 UTC the 11:00 hour isn't rolled yet, so a 24h request covers 23 rolled hours
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 2, 12, 10));
  onTestFinished(() => { vi.useRealTimers(); });
  vi.mocked(getTopAdvertisers).mockResolvedValue([{ ...advertisers[0]!, floodAdvertCount: 20, directAdvertCount: 4 }]);
  mount();
  expect(await screen.findByText("21/d")).toBeInTheDocument();
  expect(screen.getByText("4.2/d")).toBeInTheDocument();
});

it("asks the server for flood-ranked advertisers by default and refetches direct-ranked from the toggle", async () => {
  mount();
  await screen.findByText("Old advertiser");
  expect(vi.mocked(getTopAdvertisers).mock.calls[0]!.slice(2)).toEqual(["flood", 20]);
  const sort = screen.getByRole("group", { name: "Sort advertisers by" });
  expect(within(sort).getByRole("button", { name: "Flood" })).toHaveAttribute("aria-pressed", "true");
  vi.mocked(getTopAdvertisers).mockResolvedValue([{ ...advertisers[0]!, nodeName: "Direct advertiser" }]);
  fireEvent.click(within(sort).getByRole("button", { name: "Direct" }));
  await screen.findByText("Direct advertiser");
  expect(vi.mocked(getTopAdvertisers).mock.calls[1]!.slice(2)).toEqual(["direct", 20]);
  expect(within(sort).getByRole("button", { name: "Direct" })).toHaveAttribute("aria-pressed", "true");
});
