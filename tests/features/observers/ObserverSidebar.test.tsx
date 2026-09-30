import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../../src/i18n";
import { ObserverSidebar } from "../../../src/features/observers/ObserverSidebar";
import { getObserversPage, getTopObservers } from "../../../src/api/client";

vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => ({ regionKey: "YOW", iatas: ["YOW"] }) }));
vi.mock("../../../src/api/client", () => ({ getObserversPage: vi.fn(), getTopObservers: vi.fn() }));

const observers = [
  { id: "a", displayName: "Alpha", iata: "YOW", status: "online" },
  { id: "b", displayName: "Bravo", iata: "YOW", status: "offline" },
  { id: "c", displayName: "Charlie", iata: "YOW", status: "online" },
];

beforeEach(() => {
  vi.mocked(getObserversPage).mockReset().mockResolvedValue({ items: observers, hasMore: false, nextCursor: null } as never);
  vi.mocked(getTopObservers).mockReset().mockResolvedValue([
    { observerId: "c", displayName: "Charlie", iata: "YOW", observationCount: 900 },
    { observerId: "a", displayName: "Alpha", iata: "YOW", observationCount: 100 },
  ] as never);
});

function view(onSelect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ObserverSidebar range="7d" selectedId="a" onSelect={onSelect} /></QueryClientProvider>);
  return onSelect;
}
const names = () => screen.getAllByRole("option").map((o) => o.textContent);

it("lists every observer busiest first, with idle ones last", async () => {
  view();
  await screen.findByRole("option", { name: /Charlie/ });
  expect(names()).toEqual([expect.stringMatching(/^Charlie.*900/), expect.stringMatching(/^Alpha.*100/), expect.stringMatching(/^Bravo/)]);
  expect(screen.getByRole("option", { name: /Alpha/ })).toHaveAttribute("aria-selected", "true");
  expect(getTopObservers).toHaveBeenCalledWith(["YOW"], expect.any(Number), 200);
});

it("sorts by name on request and filters by search", async () => {
  view();
  await screen.findByRole("option", { name: /Charlie/ });
  fireEvent.click(screen.getByRole("button", { name: "Name" }));
  expect(names().map((n) => n?.match(/^[A-Z][a-z]+/)?.[0])).toEqual(["Alpha", "Bravo", "Charlie"]);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search observers" }), { target: { value: "brav" } });
  expect(names()).toHaveLength(1);
  expect(within(screen.getByRole("listbox")).getByText("Bravo")).toBeInTheDocument();
});

it("selects an observer on click", async () => {
  const onSelect = view();
  fireEvent.click(await screen.findByRole("option", { name: /Charlie/ }));
  expect(onSelect).toHaveBeenCalledWith("c");
});

it("loads every page of observers", async () => {
  vi.mocked(getObserversPage)
    .mockResolvedValueOnce({ items: [observers[0]], hasMore: true, nextCursor: 5 } as never)
    .mockResolvedValueOnce({ items: [observers[1], observers[2]], hasMore: false, nextCursor: null } as never);
  view();
  await screen.findByRole("option", { name: /Bravo/ });
  expect(getObserversPage).toHaveBeenLastCalledWith(["YOW"], { cursor: 5, limit: 200 });
});
