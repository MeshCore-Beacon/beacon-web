import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { SignalTab } from "../../../src/features/stats/SignalTab";
import { useSignalStats } from "../../../src/features/stats/useSignalStats";
import i18n from "../../../src/i18n";
import { EChart } from "../../../src/features/stats/EChart";
import type { SignalStats } from "../../../src/features/stats/types";

const query = { data: { since: 0, until: 3600000, receptions: 100, snr: { samples: 80, average: 0, histogram: [{ lower: -5, upper: 0, count: 80 }] }, rssi: { samples: 90, average: -102.5, histogram: [{ lower: -110, upper: -100, count: 90 }] }, hourly: [{ hour: 0, receptions: 100, snrSamples: 80, snrAverage: 0, rssiSamples: 90, rssiAverage: -102.5 }] } as SignalStats, isPending: false, isPlaceholderData: false, isError: false, isFetching: false, refetch: vi.fn() };
const originalData = query.data;
vi.mock("../../../src/features/stats/useSignalStats", () => ({ useSignalStats: vi.fn(() => query) }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: vi.fn(() => <div data-testid="chart" />) }));
beforeEach(() => { query.data = originalData; query.isPending = false; query.isPlaceholderData = false; query.isError = false; vi.clearAllMocks(); });

it("translates the signal view while retaining the requested window, true zero and exact counts", async () => {
  await act(() => i18n.changeLanguage("fr"));
  render(<SignalTab range="7d" />);
  expect(screen.getByRole("button", { name: "Actualiser le signal" })).toBeInTheDocument();
  expect(useSignalStats).toHaveBeenCalledWith("7d");
  expect(screen.getByText("0.0 dB")).toBeInTheDocument();
  const table = screen.getByRole("table", { name: "Disponibilité des échantillons du signal" });
  expect(within(table).getByRole("row", { name: /SNR.*80.*20.*80.0%/ })).toBeInTheDocument();
  expect(screen.getByText(/1970-01-01 00:00.*1970-01-01 01:00.*UTC/)).toHaveTextContent("fin exclue");
  fireEvent.click(screen.getByRole("button", { name: "Actualiser le signal" }));
  expect(query.refetch).toHaveBeenCalledOnce();
});

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

it("redraws chart labels on language change while preserving numeric series and open details", async () => {
  render(<SignalTab range="24h" />);
  fireEvent.click(screen.getByText("Exact histogram and hourly values"));
  const details = screen.getByText("Exact histogram and hourly values").closest("details")!;
  expect(details).toHaveAttribute("open");
  const plotted = () => vi.mocked(EChart).mock.calls.slice(-5).map(([{ option }]) => {
    const series = Array.isArray(option.series) ? option.series : [option.series];
    return series.map((s) => s?.data);
  });
  const before = plotted();
  expect(before).toHaveLength(5);
  await act(() => i18n.changeLanguage("fr"));
  expect(plotted()).toEqual(before);
  expect(screen.getByText("Valeurs exactes des histogrammes et par heure").closest("details")).toHaveAttribute("open");
  expect(screen.getByRole("table", { name: "Histogramme SNR" })).toHaveTextContent("-5 à < 0");
  expect(vi.mocked(EChart).mock.lastCall?.[0].option).toMatchObject({ series: [{ name: "Disponibles" }, { name: "Indisponibles" }] });
  expect(query.refetch).not.toHaveBeenCalled();
});

it.each(["isPending", "isPlaceholderData", "isError"] as const)("translates the %s state and hides stale chart values", async (state) => {
  query[state] = true;
  await act(() => i18n.changeLanguage("fr"));
  render(<SignalTab range="7d" />);
  expect(screen.queryByText("-102.5 dBm")).not.toBeInTheDocument();
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  if (state === "isError") {
    expect(screen.getByRole("alert")).toHaveTextContent("période plus courte");
    expect(screen.getAllByText("Échec du chargement").length).toBeGreaterThan(0);
  } else expect(screen.getByText("Chargement du signal…")).toBeInTheDocument();
});

it("shows a translated empty state without implying an outage or displaying samples", async () => {
  query.data = { ...originalData, receptions: 0, hourly: [], snr: { samples: 0, average: null, histogram: [] }, rssi: { samples: 0, average: null, histogram: [] } };
  await act(() => i18n.changeLanguage("fr"));
  render(<SignalTab range="24h" />);
  expect(screen.getByText("Aucune réception conservée dans cette période.")).toBeInTheDocument();
  expect(screen.getByText(/ne prouvent pas une panne/)).toBeInTheDocument();
  expect(screen.getAllByText("Aucune donnée").length).toBeGreaterThan(0);
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
});
