import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../../src/i18n";
import { ObserverSidebar } from "../../../src/features/observers/ObserverSidebar";
import { getTopObservers } from "../../../src/api/client";
import type { ObserverSummary } from "../../../src/features/observers/types";

const region = { regionKey: "YOW", iatas: ["YOW"], isResolved: true };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/api/client", () => ({ getTopObservers: vi.fn() }));

const observers: ObserverSummary[] = [
  { id: "a", displayName: "Alpha", iata: "YOW", status: "online" },
  { id: "b", displayName: "Bravo", iata: "YOW", status: "offline" },
  { id: "c", displayName: "Charlie", iata: "YOW", status: "online" },
];

beforeEach(() => {
  vi.mocked(getTopObservers).mockReset().mockResolvedValue([
    { observerId: "c", displayName: "Charlie", iata: "YOW", observationCount: 900 },
    { observerId: "a", displayName: "Alpha", iata: "YOW", observationCount: 100 },
  ] as never);
});

function view({ list = observers, filtered = false, onSelect = vi.fn() } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ObserverSidebar observers={list} filtered={filtered} isPending={false} isError={false} onRetry={() => {}} range="7d" selectedId="a" onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return onSelect;
}
const names = () => screen.getAllByRole("option").map((o) => o.textContent);

it("lists every observer busiest first, with idle ones last", async () => {
  view();
  await screen.findByText("900");
  expect(names()).toEqual([expect.stringMatching(/^Charlie.*900/), expect.stringMatching(/^Alpha.*100/), expect.stringMatching(/^Bravo/)]);
  expect(screen.getByRole("option", { name: /Alpha/ })).toHaveAttribute("aria-selected", "true");
  expect(getTopObservers).toHaveBeenCalledWith(["YOW"], expect.any(Number), 200);
});

it("sorts by name on request", async () => {
  view();
  await screen.findByText("900");
  fireEvent.click(screen.getByRole("button", { name: "Name" }));
  expect(names().map((n) => n?.match(/^[A-Z][a-z]+/)?.[0])).toEqual(["Alpha", "Bravo", "Charlie"]);
});

it("selects an observer on click", async () => {
  const onSelect = view();
  fireEvent.click(await screen.findByRole("option", { name: /Charlie/ }));
  expect(onSelect).toHaveBeenCalledWith("c");
});

it("says when the filters match nothing", () => {
  view({ list: [], filtered: true });
  expect(screen.getByText("No matches")).toBeInTheDocument();
});

it("does not load activity counts for every IATA while the region is unresolved", async () => {
  region.isResolved = false;
  view();
  await Promise.resolve();
  expect(getTopObservers).not.toHaveBeenCalled();
  region.isResolved = true;
});
