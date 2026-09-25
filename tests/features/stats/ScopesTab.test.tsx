import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ScopesTab } from "../../../src/features/stats/ScopesTab";
import { EChart } from "../../../src/features/stats/EChart";
import i18n from "../../../src/i18n";
const query = { data: [
  { name: "#west", packetCount: 3, observerCount: 2, nodeCount: 2 },
  { name: "#east", packetCount: 2, observerCount: 2, nodeCount: 3 },
], isPending: false, isLoading: false, isPlaceholderData: false, isError: false, isFetching: false, refetch: vi.fn() };
const originalData = query.data;
vi.mock("../../../src/features/stats/useStats", () => ({ useScopes: () => query }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: vi.fn(() => <div data-testid="chart" />) }));
beforeEach(() => { vi.clearAllMocks(); query.data = originalData; query.isError = false; query.isPending = false; query.isPlaceholderData = false; });

it("translates scope counts and membership guidance without changing scope names or values", async () => {
  await act(() => i18n.changeLanguage("fr"));
  render(<ScopesTab />);
  expect(screen.getByRole("heading", { name: "Scopes de transport" })).toBeInTheDocument();
  const table = screen.getByRole("table", { name: "Effectifs des scopes" });
  expect(within(table).getByRole("row", { name: /#west.*3.*2.*2/ })).toBeInTheDocument();
  expect(within(table).getByRole("row", { name: /#east.*2.*2.*3/ })).toBeInTheDocument();
  expect(screen.getByText("Appartenances d’observateurs")).toBeInTheDocument();
  expect(screen.getByText(/plusieurs scopes/)).toHaveTextContent("sans période sélectionnée");
  expect(screen.getByText("2 sur 2 scopes")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Actualiser les scopes" }));
  expect(query.refetch).toHaveBeenCalledOnce();
});

it("keeps the current search and chart values when changing language", async () => {
  render(<ScopesTab />);
  fireEvent.change(screen.getByRole("searchbox", { name: "Find a scope" }), { target: { value: " EAST " } });
  const charts = () => vi.mocked(EChart).mock.calls.slice(-3).map(([{ option }]) => option);
  const bars = (chart: ReturnType<typeof charts>[number]) => (Array.isArray(chart.series) ? chart.series : [chart.series]).map((series) => series?.data);
  const before = charts();
  await act(() => i18n.changeLanguage("fr"));
  expect(screen.getByRole("searchbox", { name: "Rechercher un scope" })).toHaveValue(" EAST ");
  expect(screen.getByText("1 sur 2 scopes")).toBeInTheDocument();
  expect(screen.queryByText("#west")).not.toBeInTheDocument();
  expect(screen.getByRole("row", { name: /#east.*2.*2.*3/ })).toBeInTheDocument();
  charts().forEach((chart, i) => {
    expect(bars(chart)).toEqual(bars(before[i]!));
    expect(chart.yAxis).toEqual(before[i]!.yAxis);
    expect(chart.aria).not.toEqual(before[i]!.aria);
  });
  expect(query.refetch).not.toHaveBeenCalled();
});

it.each(["isPending", "isPlaceholderData", "isError"] as const)("translates %s and hides stale regional scopes", async (state) => {
  query[state] = true;
  await act(() => i18n.changeLanguage("fr"));
  render(<ScopesTab />);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  expect(screen.queryByText("#west")).not.toBeInTheDocument();
  if (state === "isError") {
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger les scopes");
    expect(screen.getByText("Données indisponibles")).toBeInTheDocument();
  } else expect(screen.getByText("Chargement des scopes…")).toBeInTheDocument();
});

it("distinguishes a translated empty dataset from a search with no match", async () => {
  await act(() => i18n.changeLanguage("fr"));
  const { rerender } = render(<ScopesTab />);
  const search = screen.getByRole("searchbox", { name: "Rechercher un scope" });
  fireEvent.change(search, { target: { value: "#absent" } });
  expect(screen.getByText("Aucun scope ne correspond à cette recherche.")).toBeInTheDocument();
  expect(screen.getByText("0 sur 2 scopes")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "" } });
  query.data = []; rerender(<ScopesTab />);
  expect(screen.getByText("Aucune donnée de scope disponible.")).toBeInTheDocument();
  expect(screen.getAllByText("Aucune donnée")).toHaveLength(3);
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
});

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
