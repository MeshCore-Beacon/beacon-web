import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../../src/i18n";
import { ObserverComparison } from "../../../src/features/observers/ObserverComparison";
import { getObserverActivity, getObserverComparison } from "../../../src/api/client";
import type { Observer } from "../../../src/features/observers/types";
import type { ObserverActivity } from "../../../src/features/stats/types";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const until = Math.floor(Date.now() / 3_600_000) * 3_600_000;
const observer = { id: A, displayName: "Roof A", brokers: [], iata: "YOW" } as unknown as Observer;
const activity: ObserverActivity = { range: "168h", interval: "1h", windowStart: until - 604_800_000, windowEnd: until, generatedAt: until, source: "hourly", radio: null, payloadTypes: [], points: [], summary: { recordedPackets: 19, lastCompleteHour: 1, lastCompleteHourStart: until - 3_600_000, lastCompleteHourEnd: until, latestRecordedAt: null } };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => ({ regionKey: "YOW", iatas: ["YOW"] }) }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: ({ option }: { option: unknown }) => <output data-testid="chart">{JSON.stringify(option)}</output> }));
vi.mock("../../../src/api/client", async original => ({
  ...await original<typeof import("../../../src/api/client")>(),
  getObserver: vi.fn(async (id: string) => ({ ...observer, id, displayName: "Roof B" })),
  getObserversPage: vi.fn(async () => ({ items: [{ ...observer, id: B, displayName: "Roof B" }], hasMore: false })),
  getObserverActivity: vi.fn(), getObserverComparison: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getObserverActivity).mockResolvedValue({ ...activity, summary: { ...activity.summary!, recordedPackets: 23 } });
  vi.mocked(getObserverComparison).mockResolvedValue({ observerA: A, observerB: B, since: activity.windowStart!, until, onlyA: 2, both: 3, onlyB: 4, totalPackets: 9 });
});
function view(id = B, data = activity, anchor: number | null = until) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = { observerA: observer, activityA: data, range: "7d" as const, observerBId: id, until: anchor, onSelect: vi.fn(), onRefresh: vi.fn(() => anchor ?? until) };
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { ...render(<ObserverComparison {...props} />, { wrapper }), props };
}
it("aligns activity and retained overlap to the primary observer's effective window", async () => {
  view();
  expect(await screen.findByText("23")).toBeInTheDocument();
  expect(screen.getByText("19")).toBeInTheDocument();
  expect(getObserverActivity).toHaveBeenCalledWith(B, "168h", "1h", until);
  expect(getObserverComparison).toHaveBeenCalledWith(undefined, { observerA: A, observerB: B, since: activity.windowStart, until }, expect.any(AbortSignal));
  expect(screen.getByText("Retained flood-packet overlap")).toBeInTheDocument();
  expect(screen.getByText(/Raw packet history may expire/)).toBeInTheDocument();
  expect(screen.getByTestId("chart").textContent).toContain('"name":"A"');
  expect(screen.getByTestId("chart").textContent).toContain('"name":"B"');
});
it("does not compare mismatched or old-server windows", async () => {
  vi.mocked(getObserverActivity).mockResolvedValue({ ...activity, windowEnd: until - 3_600_000 });
  view();
  expect(await screen.findByText(/Aligned summaries are unavailable/)).toBeInTheDocument();
  expect(getObserverComparison).not.toHaveBeenCalled();
  expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
});
it.each([A, "broken-id", ""]) ("never requests overlap for an invalid or missing partner: %s", async id => {
  view(id);
  expect((await screen.findAllByText(id ? /Choose a different observer/ : /Choose an observer to compare/)).length).toBeGreaterThan(0);
  expect(getObserverActivity).not.toHaveBeenCalled();
  expect(getObserverComparison).not.toHaveBeenCalled();
});
it("rejects a bad anchor and offers a fresh common window", async () => {
  const { props } = view(B, activity, null);
  expect(await screen.findByText(/This comparison time is invalid/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh both observers" }));
  expect(props.onRefresh).toHaveBeenCalled();
  expect(getObserverActivity).not.toHaveBeenCalled();
});
it("clears the previous partner's totals while the next request is pending", async () => {
  const { props, rerender } = view();
  expect(await screen.findByText("23")).toBeInTheDocument();
  vi.mocked(getObserverActivity).mockImplementation(() => new Promise(() => {}));
  rerender(<ObserverComparison {...props} observerBId="33333333-3333-3333-3333-333333333333" />);
  await waitFor(() => expect(screen.queryByText("23")).not.toBeInTheDocument());
  expect(screen.queryByText("9 distinct flood packets")).not.toBeInTheDocument();
});

it("refreshes the current window without requesting the obsolete window after re-anchoring", async () => {
  const { props } = view();
  await waitFor(() => expect(getObserverComparison).toHaveBeenCalledTimes(1));
  const activityCalls = vi.mocked(getObserverActivity).mock.calls.length;
  props.onRefresh.mockReturnValue(until + 3_600_000);
  fireEvent.click(screen.getByRole("button", { name: "Refresh both observers" }));
  expect(getObserverActivity).toHaveBeenCalledTimes(activityCalls);
  expect(getObserverComparison).toHaveBeenCalledTimes(1);

  props.onRefresh.mockReturnValue(until);
  fireEvent.click(screen.getByRole("button", { name: "Refresh both observers" }));
  await waitFor(() => expect(getObserverActivity).toHaveBeenCalledTimes(activityCalls + 1));
  expect(getObserverComparison).toHaveBeenCalledTimes(2);
});
