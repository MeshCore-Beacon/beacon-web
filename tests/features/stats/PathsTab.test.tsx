import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { PathsTab } from "../../../src/features/stats/PathsTab";
import { usePathStats } from "../../../src/features/stats/usePathStats";
import { EChart } from "../../../src/features/stats/EChart";
import i18n from "../../../src/i18n";

const query = { data: { since: 0, until: 3600000, receptions: 100, hashed: 60, empty: 20, trace: 10, unclassified: 10,
  hashWidths: [{ bytes: 1, receptions: 20 }, { bytes: 2, receptions: 30 }, { bytes: 3, receptions: 10 }], pathLengths: [{ entries: 0, receptions: 20 }, { entries: 2, receptions: 60 }],
  hourly: [{ hour: 0, receptions: 100, oneByte: 20, twoByte: 30, threeByte: 10, empty: 20, trace: 10, unclassified: 10 }] }, isPending: false, isPlaceholderData: false, isError: false, isFetching: false, refetch: vi.fn() };
vi.mock("../../../src/features/stats/usePathStats", () => ({ usePathStats: vi.fn(() => query) }));
const originalData = query.data;
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: vi.fn(() => <div data-testid="chart" />) }));
beforeEach(() => { query.data = originalData; query.isPending = false; query.isPlaceholderData = false; query.isError = false; vi.clearAllMocks(); });

it("translates classification and exact tables while preserving counts and the requested window", async () => {
  await act(() => i18n.changeLanguage("fr"));
  render(<PathsTab range="7d" />);
  expect(screen.getByRole("heading", { name: "Chemins et hachages" })).toBeInTheDocument();
  expect(usePathStats).toHaveBeenCalledWith("7d");
  expect(screen.getByText("7 j")).toBeInTheDocument();
  expect(screen.getByText("66.7%")).toBeInTheDocument();
  const table = screen.getByRole("table", { name: "Effectifs par catégorie de chemin" });
  expect(within(table).getByRole("row", { name: /Chemins hachés.*60.*60.0%/ })).toBeInTheDocument();
  expect(within(table).getByRole("row", { name: /Vides.*20.*20.0%/ })).toBeInTheDocument();
  expect(within(table).getByRole("row", { name: /Non classés.*10.*10.0%/ })).toBeInTheDocument();
  expect(screen.getByText(/1970-01-01 00:00.*1970-01-01 01:00.*UTC/)).toHaveTextContent("fin exclue");
  fireEvent.click(screen.getByText("Valeurs exactes des largeurs, longueurs et par heure"));
  expect(screen.getByRole("table", { name: "Effectifs par largeur de hachage" })).toHaveTextContent("Octets par hachage");
  expect(within(screen.getByRole("table", { name: "Effectifs par nombre d’entrées" })).getByRole("row", { name: "0 20" })).toBeInTheDocument();
  expect(within(screen.getByRole("table", { name: "Effectifs horaires des chemins" })).getByRole("row", { name: "1970-01-01 00:00 100 20 30 10 20 10 10" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Actualiser les chemins" }));
  expect(query.refetch).toHaveBeenCalledOnce();
});

it("redraws all chart labels on language change and keeps exact details open", async () => {
  render(<PathsTab range="24h" />);
  fireEvent.click(screen.getByText("Exact width, path-length and hourly values"));
  const chartOptions = () => vi.mocked(EChart).mock.calls.slice(-4).map(([{ option }]) => option);
  const before = chartOptions();
  expect(before).toHaveLength(4);
  await act(() => i18n.changeLanguage("fr"));
  expect(screen.getByText("Valeurs exactes des largeurs, longueurs et par heure").closest("details")).toHaveAttribute("open");
  const after = chartOptions();
  expect(after[0]).toMatchObject({ series: [{ data: [{ name: "1 octet", value: 20 }, { name: "2 octets", value: 30 }, { name: "3 octets", value: 10 }] }] });
  expect(after[1]).toMatchObject({ xAxis: { name: "Entrées du chemin" }, series: [{ name: "Réceptions", data: [{ value: 20 }, { value: 0 }, { value: 60 }] }] });
  expect(after[2]).toMatchObject({ series: [{ name: "1 octet", data: [[0, 20]] }, { name: "2 octets", data: [[0, 30]] }, { name: "3 octets", data: [[0, 10]] }] });
  expect(after[3]).toMatchObject({ series: [{ data: [{ name: "Chemins hachés", value: 60 }, { name: "Vides", value: 20 }, { name: "Trace", value: 10 }, { name: "Non classés", value: 10 }] }] });
  after.forEach((option, i) => expect(option.aria).not.toEqual(before[i]!.aria));
  expect(query.refetch).not.toHaveBeenCalled();
});

it("uses only nonempty hash paths for multi-byte share, exposes categories and explains remaining routes", () => {
  render(<PathsTab range="24h" />);
  expect(usePathStats).toHaveBeenCalledWith("24h");
  expect(screen.getByText("66.7%")).toBeInTheDocument();
  expect(screen.getByText(/direct routes/i)).toHaveTextContent("remaining");
  const table = screen.getByRole("table", { name: "Path classification counts" });
  expect(within(table).getByRole("row", { name: /Hash paths.*60.*60.0%/ })).toBeInTheDocument();
  expect(within(table).getByRole("row", { name: /Empty.*20.*20.0%/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh paths" }));
  expect(query.refetch).toHaveBeenCalledOnce();
});
it.each(["isPending", "isPlaceholderData", "isError"] as const)("hides old values when %s", (state) => {
  query[state] = true; render(<PathsTab range="7d" />);
  expect(screen.queryByText("66.7%")).not.toBeInTheDocument();
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  if (state === "isError") expect(screen.getByRole("alert")).toHaveTextContent("shorter");
});

it.each(["isPending", "isPlaceholderData", "isError"] as const)("translates %s without displaying old paths", async (state) => {
  query[state] = true;
  await act(() => i18n.changeLanguage("fr"));
  render(<PathsTab range="30d" />);
  expect(screen.queryByText("66.7%")).not.toBeInTheDocument();
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  if (state === "isError") {
    expect(screen.getByRole("alert")).toHaveTextContent("période plus courte");
    expect(screen.getByText("Données indisponibles")).toBeInTheDocument();
  } else expect(screen.getByText("Chargement des chemins…")).toBeInTheDocument();
});

it("translates empty coverage without inventing hash-width votes or hourly records", async () => {
  query.data = { ...originalData, receptions: 0, hashed: 0, empty: 0, trace: 0, unclassified: 0, hashWidths: [], pathLengths: [], hourly: [] };
  await act(() => i18n.changeLanguage("fr"));
  render(<PathsTab range="24h" />);
  expect(screen.getByText("Aucune réception conservée dans cette période.")).toBeInTheDocument();
  expect(screen.getAllByText("Aucune donnée")).toHaveLength(4);
  expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
