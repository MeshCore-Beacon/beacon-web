import { describe, it, expect, vi } from "vitest";
import "../../../src/i18n";
import { act, render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useNavigate, useLocation } from "react-router-dom";
import type { WsManager } from "../../../src/api/ws-manager";
import type { ObserverSummary } from "../../../src/features/observers/types";
import { useObserverDirectory } from "../../../src/features/observers/useObserverDirectory";
import { ObserverPage } from "../../../src/features/observers/ObserverPage";

const directory: ObserverSummary[] = [
  { id: "observer-a", displayName: "Roof A", iata: "YOW", status: "online", observerType: "meshcore-ha" },
  { id: "observer-b", displayName: "Basement B", iata: "YOW", status: "offline", observerType: "RemoteTerm" },
];
vi.mock("../../../src/features/observers/useObserverDirectory", () => ({
  useObserverDirectory: vi.fn((_ws: unknown, options: { search?: string } | string) => {
    const search = typeof options === "string" ? "" : options.search ?? "";
    const rows = directory.filter(o => search === "%" || o.displayName?.toLowerCase().includes(search));
    return { data: directory, observers: rows, observerTypes: ["meshcore-ha", "RemoteTerm"], isPending: false,
      isError: false, retry: vi.fn(), refetch: vi.fn(), loadMore: vi.fn(), resetKey: search };
  }),
}));
vi.mock("../../../src/hooks/useScopes", () => ({ useScopes: () => [] }));
vi.mock("../../../src/api/client", () => ({ getBrokers: () => Promise.resolve([]) }));
vi.mock("../../../src/features/observers/ObserverSidebar", () => ({
  ObserverSidebar: ({ observers, onSelect }: { observers: ObserverSummary[]; onSelect: (id: string) => void }) => (
    <ul aria-label="Observer list">
      {observers.map((o) => <li key={o.id}><button onClick={() => onSelect(o.id)}>{o.displayName}</button></li>)}
    </ul>
  ),
}));
vi.mock("../../../src/features/stats/ObserverTab", () => ({
  ObserverTab: ({
    selectedObserverId,
    range,
    comparison,
    actions,
  }: {
    selectedObserverId: string;
    range: string;
    comparison?: { until: number | null; onRefresh: () => void };
    actions?: React.ReactNode;
  }) => (
    <>
      <div data-testid="header-actions">{actions}</div>
      <h1>
        Dashboard {selectedObserverId} {range}
      </h1>
      {comparison && (
        <>
          <output data-testid="comparison-until">{String(comparison.until)}</output>
          <button onClick={comparison.onRefresh}>Refresh comparison</button>
        </>
      )}
    </>
  ),
}));
function Location() {
  const l = useLocation();
  const go = useNavigate();
  return (
    <>
      <output>{l.search}</output>
      <button onClick={() => go(-1)}>Browser back</button>
      <button onClick={() => go(1)}>Browser forward</button>
    </>
  );
}
function view(url = "?tab=Observers&iata=YOW") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Location />
        <ObserverPage wsManager={{} as WsManager} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const list = () => within(screen.getByRole("list", { name: "Observer list" }));

describe("Observer destination", () => {
  it("prompts for an observer next to the list until one is picked", () => {
    view();
    expect(screen.getByText("Choose an observer")).toBeInTheDocument();
    expect(list().getAllByRole("button").map((b) => b.textContent)).toEqual(["Roof A", "Basement B"]);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
  it("narrows the list with the filter bar", async () => {
    view();
    fireEvent.change(screen.getByPlaceholderText("Search by name..."), { target: { value: "base" } });
    await waitFor(() => expect(list().getAllByRole("button").map((b) => b.textContent)).toEqual(["Basement B"]));
  });
  it("opens a canonical dashboard beside the list and keeps the filters across Back", async () => {
    view();
    fireEvent.change(screen.getByPlaceholderText("Search by name..."), { target: { value: "roof" } });
    await waitFor(() => expect(list().getAllByRole("button")).toHaveLength(1));
    fireEvent.click(list().getByText("Roof A"));
    expect(await screen.findByRole("heading")).toHaveTextContent("Dashboard observer-a 7d");
    expect(list().getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain("observer=observer-a");
    expect(screen.getByRole("status").textContent).toContain("iata=YOW");
    fireEvent.click(screen.getByText("Browser back"));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by name...")).toHaveValue("roof");
    fireEvent.click(screen.getByText("Browser forward"));
    expect(await screen.findByRole("heading")).toHaveTextContent("observer-a");
  });
  it("restores a deep link with its range in the filter bar", async () => {
    view("?tab=Observers&observer=observer-b&range=30d");
    expect(await screen.findByRole("heading")).toHaveTextContent("Dashboard observer-b 30d");
    const toolbar = screen.getByRole("toolbar", { name: "Observer filters" });
    const options = within(within(toolbar).getByRole("group", { name: "Time range" })).getAllByRole("button");
    expect(options.map(option => option.textContent)).toEqual(["24h", "7d", "30d"]);
    expect(options[2]).toHaveAttribute("aria-pressed", "true");
  });
  it("puts observer actions in the dashboard header", async () => {
    view("?tab=Observers&observer=observer-a&range=7d");
    await screen.findByRole("heading");
    const header = screen.getByTestId("header-actions");
    expect(within(header).getByRole("button", { name: "Compare with…" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Copy observer link" })).toHaveTextContent("Copy link");
    expect(screen.getAllByRole("button", { name: "Compare with…" })).toHaveLength(1);
  });
  it("closes the mobile overlay from its header, back to the list", async () => {
    view("?tab=Observers&observer=observer-a&range=7d");
    await screen.findByRole("heading");
    const header = screen.getByText("Observer detail").parentElement!;
    expect(header).toHaveClass("md:hidden");
    fireEvent.click(within(header).getByRole("button", { name: "Back to observers" }));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByRole("status").textContent).not.toContain("observer=");
  });
  it("minimizes the mobile overlay over the list and expands for the next pick", async () => {
    view("?tab=Observers&observer=observer-a&range=7d");
    const body = () => screen.getByRole("heading").closest(".overflow-auto")!;
    await screen.findByRole("heading");
    expect(list().getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Minimize detail panel" }));
    expect(body()).toHaveClass("hidden");
    fireEvent.click(list().getByText("Basement B"));
    expect(await screen.findByRole("heading")).toHaveTextContent("observer-b");
    expect(body()).not.toHaveClass("hidden");
  });
});

it("anchors a new comparison at the click time and accepts Refresh across an hour boundary", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 8, 29, 12, 30));
  try {
    view("?tab=Observers&observer=observer-a&range=24h");
    await screen.findByRole("heading");
    clock.mockReturnValue(Date.UTC(2026, 8, 29, 15, 59, 59));
    fireEvent.click(screen.getByRole("button", { name: "Compare with…" }));
    expect(screen.getByTestId("comparison-until")).toHaveTextContent(String(Date.UTC(2026, 8, 29, 15)));
    clock.mockReturnValue(Date.UTC(2026, 8, 29, 16, 0, 1));
    fireEvent.click(screen.getByRole("button", { name: "Refresh comparison" }));
    expect(screen.getByTestId("comparison-until")).toHaveTextContent(String(Date.UTC(2026, 8, 29, 16)));
    fireEvent.click(screen.getByRole("button", { name: "Close comparison" }));
    expect(screen.queryByTestId("comparison-until")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent("compareUntil");
  } finally {
    clock.mockRestore();
  }
});

it("rejects duplicate, malformed and future comparison anchors", async () => {
  const viewResult = view("?tab=Observers&observer=observer-a&compareWith=observer-b&compareUntil=bad");
  expect(await screen.findByTestId("comparison-until")).toHaveTextContent("null");
  viewResult.unmount();
  const future = view("?tab=Observers&observer=observer-a&compareWith=observer-b&compareUntil=" + (Date.now() + 86400000));
  expect(await screen.findByTestId("comparison-until")).toHaveTextContent("null");
  future.unmount();
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000 - 3_600_000;
  view(`?tab=Observers&observer=observer-a&compareWith=observer-b&compareUntil=${hour}&compareUntil=${hour}`);
  expect(await screen.findByTestId("comparison-until")).toHaveTextContent("null");
});

it("preserves server-filtered wildcard results instead of filtering the loaded page again", async () => {
  view();
  fireEvent.change(screen.getByPlaceholderText("Search by name..."), { target: { value: "%" } });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
  expect(list().getAllByRole("button")).toHaveLength(2);
});


it("changes the detail range without changing the directory request", async () => {
  view("?tab=Observers&observer=observer-a&range=7d");
  expect(await screen.findByRole("heading")).toHaveTextContent("Dashboard observer-a 7d");
  const before = vi.mocked(useObserverDirectory).mock.calls.at(-1)![1];
  expect(before).not.toHaveProperty("range");
  fireEvent.click(within(screen.getByRole("group", { name: "Time range" })).getByRole("button", { name: "30d" }));
  expect(await screen.findByRole("heading")).toHaveTextContent("Dashboard observer-a 30d");
  expect(vi.mocked(useObserverDirectory).mock.calls.at(-1)![1]).toEqual(before);
  expect(list().getAllByRole("button")).toHaveLength(2);
});
