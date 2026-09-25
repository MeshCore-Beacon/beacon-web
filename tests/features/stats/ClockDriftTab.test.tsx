import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ClockDriftTab } from "../../../src/features/stats/ClockDriftTab";
import { useClockDrift } from "../../../src/features/stats/useStats";
import type { ClockDriftEntry } from "../../../src/features/stats/types";
import i18n from "../../../src/i18n";

const rows: ClockDriftEntry[] = [
  { nodeId: "fixture-a", nodeName: "Alpha", nodeType: 2, nodeTypeName: "Repeater", clockDriftSeconds: 3599, clockCheckedAt: 1000, iatas: [{ iata: "YVR", lastHeard: 1000 }] },
  { nodeId: "fixture-b", nodeName: "Beta", nodeType: 3, nodeTypeName: "Room", clockDriftSeconds: -3600, clockCheckedAt: 2000, iatas: [{ iata: "YOW", lastHeard: 2000 }] },
];
const query = { data: rows, isLoading: false, isPending: false, isPlaceholderData: false, isError: false, isFetching: false };
vi.mock("../../../src/features/stats/useStats", () => ({ useClockDrift: vi.fn(() => query) }));
beforeEach(() => { vi.clearAllMocks(); query.data = rows; query.isLoading = false; query.isPending = false; query.isPlaceholderData = false; query.isError = false; query.isFetching = false; });

it("translates clock labels and direction without changing signs, thresholds or worst-first ordering", async () => {
  await act(() => i18n.changeLanguage("fr"));
  const { container } = render(<ClockDriftTab />);
  expect(useClockDrift).toHaveBeenCalledWith();
  expect(screen.getByText(/Répéteurs et serveurs de salon désynchronisés/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Dérive\s*▼$/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Nœud\s*▲$/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Vérifié\s*▲$/ })).toBeInTheDocument();
  expect(screen.getByText("+59m 59s en avance")).toHaveClass("text-warn");
  expect(screen.getByText("-1h 0m en retard")).toHaveClass("text-danger");
  expect(screen.getByText("YVR")).toBeInTheDocument();
  expect(screen.getByText("YOW")).toBeInTheDocument();
  expect([...container.querySelectorAll("tbody tr")].map((row) => row.querySelector("td")?.textContent)).toEqual(["BetaRoom", "AlphaRepeater"]);
});

it("retains a user-selected sort and raw node values across a language change", async () => {
  const { container } = render(<ClockDriftTab />);
  fireEvent.click(screen.getByRole("button", { name: /^Node\s*▲$/ }));
  const order = () => [...container.querySelectorAll("tbody tr")].map((row) => row.querySelector("td")?.textContent);
  expect(order()).toEqual(["AlphaRepeater", "BetaRoom"]);
  await act(() => i18n.changeLanguage("fr"));
  expect(order()).toEqual(["AlphaRepeater", "BetaRoom"]);
  fireEvent.click(screen.getByRole("button", { name: /^Nœud\s*▲$/ }));
  expect(order()).toEqual(["BetaRoom", "AlphaRepeater"]);
  expect(screen.getByRole("button", { name: /^Nœud\s*▼$/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Dérive\s*▲$/ }));
  expect(order()).toEqual(["AlphaRepeater", "BetaRoom"]);
});

it.each(["isPending", "isPlaceholderData", "isError"] as const)("shows the translated %s state without cached rows", async (state) => {
  query[state] = true;
  await act(() => i18n.changeLanguage("fr"));
  render(<ClockDriftTab />);
  expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  if (state === "isError") expect(screen.getByText("Échec du chargement")).toBeInTheDocument();
  else expect(screen.queryByText("Aucun répéteur désynchronisé")).not.toBeInTheDocument();
});

it("translates an empty result without inventing out-of-sync nodes", async () => {
  query.data = [];
  await act(() => i18n.changeLanguage("fr"));
  render(<ClockDriftTab />);
  expect(screen.getByText("Aucun répéteur désynchronisé")).toBeInTheDocument();
});

it("retains valid values during a healthy background refresh", () => {
  query.isFetching = true;
  render(<ClockDriftTab />);
  expect(screen.getByText("Alpha")).toBeInTheDocument();
  expect(screen.getByText("+59m 59s ahead")).toHaveClass("text-warn");
  expect(screen.getByText("-1h 0m behind")).toHaveClass("text-danger");
});
