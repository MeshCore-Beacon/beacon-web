import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SignalTab } from "../../../src/features/stats/SignalTab";
import { useSignalStats } from "../../../src/features/stats/useSignalStats";

const query = { data: { since: 0, until: 3600000, receptions: 100, snr: { samples: 80, average: 0, histogram: [{ lower: -5, upper: 0, count: 80 }] }, rssi: { samples: 90, average: -102.5, histogram: [{ lower: -110, upper: -100, count: 90 }] }, hourly: [{ hour: 0, receptions: 100, snrSamples: 80, snrAverage: 0, rssiSamples: 90, rssiAverage: -102.5 }] }, isPending: false, isPlaceholderData: false, isError: false, isFetching: false, refetch: vi.fn() };
vi.mock("../../../src/features/stats/useSignalStats", () => ({ useSignalStats: vi.fn(() => query) }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => <div data-testid="chart" /> }));
beforeEach(() => { query.isPending = false; query.isPlaceholderData = false; query.isError = false; vi.clearAllMocks(); });

it("shows measured units, exact sample coverage and refresh without treating zero SNR as missing", () => {
  render(<SignalTab range="24h" />);
  expect(useSignalStats).toHaveBeenCalledWith("24h");
  expect(screen.getByText("0.0 dB")).toBeInTheDocument();
  expect(screen.getByText("-102.5 dBm")).toBeInTheDocument();
  expect(screen.getByText(/last hop/i)).toBeInTheDocument();
  const table = screen.getByRole("table", { name: "Signal sample availability" });
  expect(within(table).getByRole("row", { name: /SNR.*80.*20.*80.0%/ })).toBeInTheDocument();
  expect(within(table).getByRole("row", { name: /RSSI.*90.*10.*90.0%/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh signal" }));
  expect(query.refetch).toHaveBeenCalledOnce();
});
it.each(["isPending", "isPlaceholderData", "isError"] as const)("hides previous filter values when %s", (state) => {
  query[state] = true;
  render(<SignalTab range="7d" />);
  expect(screen.queryByText("-102.5 dBm")).not.toBeInTheDocument();
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  if (state === "isError") expect(screen.getByRole("alert")).toHaveTextContent("shorter");
});
