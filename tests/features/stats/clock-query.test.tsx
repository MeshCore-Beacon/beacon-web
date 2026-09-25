import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClockDriftTab } from "../../../src/features/stats/ClockDriftTab";
import { getClockDrift } from "../../../src/api/client";
import i18n from "../../../src/i18n";

vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => ({ iatas: ["YVR"], regionKey: "YVR" }) }));
vi.mock("../../../src/api/client", () => ({ getClockDrift: vi.fn(() => Promise.resolve([])) }));
afterEach(() => vi.clearAllMocks());

it("reuses the regional clock query and limit when only the language changes", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(<QueryClientProvider client={client}><ClockDriftTab /></QueryClientProvider>);
  await screen.findByText("No repeaters out of sync");
  expect(getClockDrift).toHaveBeenCalledOnce();
  expect(getClockDrift).toHaveBeenCalledWith(["YVR"], 100);
  await act(() => i18n.changeLanguage("fr"));
  expect(screen.getByText("Aucun répéteur désynchronisé")).toBeInTheDocument();
  expect(getClockDrift).toHaveBeenCalledOnce();
  expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([["stats-clock-drift", "YVR", 100]]);
  unmount(); client.clear();
});
