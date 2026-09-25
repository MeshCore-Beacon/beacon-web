import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { TrafficTab } from "../../../src/features/stats/TrafficTab";
import { useStatsObservations } from "../../../src/features/stats/useStats";
import { EChart } from "../../../src/features/stats/EChart";
import i18n from "../../../src/i18n";

const query = { data: [{ hour: Date.UTC(2026, 8, 19, 12), iata: "YOW", observationCount: 1200, uniquePackets: 9999, activeObservers: 88 }], dataUpdatedAt: Date.UTC(2026, 8, 19, 12, 30), isPending: false, isLoading: false, isPlaceholderData: false, isError: false, isFetching: false, refetch: vi.fn() };
const originalData = query.data;
vi.mock("../../../src/features/stats/useStats", () => ({ useStatsObservations: vi.fn(() => query) }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: vi.fn(() => <div data-testid="chart" />) }));

beforeEach(() => {
  query.data = originalData; query.isPending = false; query.isLoading = false; query.isPlaceholderData = false; query.isError = false; query.isFetching = false;
  vi.clearAllMocks();
});

describe("Traffic page", () => {
  it("translates the page and exact table without changing reception counts, IATA codes or ranges", async () => {
    await act(() => i18n.changeLanguage("fr"));
    render(<TrafficTab range="7d" />);
    expect(screen.getByRole("heading", { name: "Trafic" })).toBeInTheDocument();
    expect(useStatsObservations).toHaveBeenCalledWith("7d");
    expect(screen.getByText("Activité horaire · 7 j")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Réceptions par IATA" });
    expect(within(table).getByRole("row", { name: /YOW.*1,200.*100.0%/ })).toBeInTheDocument();
    expect(screen.queryByText("9,999")).not.toBeInTheDocument();
    expect(screen.getByText(/heure UTC/)).toHaveTextContent("partielle");
    expect(screen.getByText(/ne prouvent pas une panne/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actualiser le trafic" }));
    expect(query.refetch).toHaveBeenCalledOnce();
  });

  it("redraws grouped and unassigned chart labels on language change without altering data", async () => {
    const row = originalData[0]!;
    query.data = [row, { ...row, iata: "", observationCount: 9000 }, ...["YVR", "YYZ", "YUL", "YHZ", "YYC", "YEG", "YQB", "YXE"].map((iata, i) => ({ ...row, iata, observationCount: i + 1 }))];
    const chartOptions = () => vi.mocked(EChart).mock.calls.slice(-3).map(([{ option }]) => option);
    const numbers = (options: ReturnType<typeof chartOptions>) => options.map((option) =>
      (Array.isArray(option.series) ? option.series : [option.series]).map((series) => series?.data?.map((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry) && "value" in entry ? entry.value : entry)));
    render(<TrafficTab range="24h" />);
    const before = chartOptions(), values = numbers(before);
    await act(() => i18n.changeLanguage("fr"));
    const after = chartOptions();
    expect(numbers(after)).toEqual(values);
    after.forEach((option, i) => expect(option.aria).not.toEqual(before[i]!.aria));
    expect(after[0]).toMatchObject({ series: expect.arrayContaining([expect.objectContaining({ name: "Non attribué" }), expect.objectContaining({ name: "Autres IATA" })]) });
    expect(after[2]).toMatchObject({ series: [{ data: expect.arrayContaining([expect.objectContaining({ name: "Autres IATA", value: 6 }), expect.objectContaining({ name: "Non attribué", value: 9000 })]) }] });
    expect(screen.getByRole("row", { name: /Non attribué.*9,000/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /YOW.*1,200/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Autres IATA/ })).not.toBeInTheDocument();
    expect(query.refetch).not.toHaveBeenCalled();
  });

  it.each(["isPending", "isPlaceholderData", "isError"] as const)("translates %s and hides prior-region data", async (state) => {
    query[state] = true;
    await act(() => i18n.changeLanguage("fr"));
    render(<TrafficTab range="30d" />);
    expect(screen.queryByText("YOW")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("chart")).toHaveLength(0);
    if (state === "isError") {
      expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger le trafic");
      expect(screen.getByText("Données indisponibles")).toBeInTheDocument();
    } else expect(screen.getByText("Chargement du trafic…")).toBeInTheDocument();
  });

  it("translates the empty view without inventing receptions or implying an outage", async () => {
    query.data = [];
    await act(() => i18n.changeLanguage("fr"));
    render(<TrafficTab range="24h" />);
    expect(screen.getByText("Aucune réception conservée dans cette période.")).toBeInTheDocument();
    expect(screen.getByText(/ne prouvent pas une panne/)).toBeInTheDocument();
    expect(screen.getAllByText("Aucune donnée")).toHaveLength(3);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows exact reception counts, UTC/missing-history guidance and a refresh action", () => {
    render(<TrafficTab range="24h" />);
    expect(useStatsObservations).toHaveBeenCalledWith("24h");
    const table = screen.getByRole("table", { name: "Receptions by IATA" });
    expect(within(table).getByRole("row", { name: /YOW.*1,200.*100.0%/ })).toBeInTheDocument();
    expect(screen.queryByText("9,999")).not.toBeInTheDocument();
    expect(screen.getByText(/Blank hours/)).toHaveTextContent("retained");
    expect(screen.getByText(/UTC/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh traffic" }));
    expect(query.refetch).toHaveBeenCalledOnce();
  });

  it("does not display previous-region data while a new query is loading", () => {
    query.isPlaceholderData = true;
    render(<TrafficTab range="7d" />);
    expect(screen.queryByText("YOW")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  });

  it("provides a visible error state and retry without stale chart values", () => {
    query.isError = true;
    render(<TrafficTab range="30d" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load traffic");
    expect(screen.queryByText("YOW")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh traffic" }));
    expect(query.refetch).toHaveBeenCalledOnce();
  });
});
