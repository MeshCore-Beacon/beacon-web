import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TrafficTab } from "../../../src/features/stats/TrafficTab";
import { useStatsObservations } from "../../../src/features/stats/useStats";

const query = { data: [{ hour: Date.UTC(2026, 8, 19, 12), iata: "YOW", observationCount: 1200, uniquePackets: 9999, activeObservers: 88 }], dataUpdatedAt: Date.UTC(2026, 8, 19, 12, 30), isLoading: false, isPlaceholderData: false, isError: false, isFetching: false, refetch: vi.fn() };
vi.mock("../../../src/features/stats/useStats", () => ({ useStatsObservations: vi.fn(() => query) }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => <div data-testid="chart" /> }));

beforeEach(() => {
  query.isLoading = false; query.isPlaceholderData = false; query.isError = false; query.isFetching = false;
  vi.clearAllMocks();
});

describe("Traffic page", () => {
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
