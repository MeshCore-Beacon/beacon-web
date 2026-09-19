import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ScopesTab } from "../../../src/features/stats/ScopesTab";
const query = { data: [
  { name: "#west", packetCount: 3, observerCount: 2, nodeCount: 2 },
  { name: "#east", packetCount: 2, observerCount: 2, nodeCount: 3 },
], isPending: false, isLoading: false, isPlaceholderData: false, isError: false, isFetching: false, refetch: vi.fn() };
vi.mock("../../../src/features/stats/useStats", () => ({ useScopes: () => query }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => <div data-testid="chart" /> }));
beforeEach(() => { vi.clearAllMocks(); query.isError = false; query.isPending = false; query.isPlaceholderData = false; });

it("shows exact scope counts, keeps membership semantics explicit and filters the whole view", () => {
  render(<ScopesTab />);
  const table = screen.getByRole("table", { name: "Scope counts" });
  expect(within(table).getByRole("row", { name: /#west.*3.*2.*2/ })).toBeInTheDocument();
  expect(screen.getByText("Observer memberships")).toBeInTheDocument();
  expect(screen.getByText(/An observer can appear/)).toBeInTheDocument();
  expect(screen.getByText(/Retained data/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "Find a scope" }), { target: { value: "WEST" } });
  expect(screen.queryByText("#east")).not.toBeInTheDocument();
  expect(screen.getByText(/1 of 2 scopes/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh scopes" }));
  expect(query.refetch).toHaveBeenCalledOnce();
});

it("hides stale values while a region change is pending and on errors", () => {
  query.isPlaceholderData = true;
  const { rerender } = render(<ScopesTab />);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  query.isPlaceholderData = false; query.isError = true; rerender(<ScopesTab />);
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load scopes");
  expect(screen.queryByText("#west")).not.toBeInTheDocument();
});
