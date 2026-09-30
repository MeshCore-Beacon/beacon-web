import { describe, it, expect, vi } from "vitest";
import "../../../src/i18n";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useNavigate, useLocation } from "react-router-dom";
import type { WsManager } from "../../../src/api/ws-manager";
import { ObserverPage } from "../../../src/features/observers/ObserverPage";

vi.mock("../../../src/features/observers/ObserverTable", () => ({
  ObserverTable: ({ onSelectObserver }: { onSelectObserver: (id: string) => void }) => {
    const [search, setSearch] = useState("");
    return (
      <div>
        <input aria-label="Directory search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button onClick={() => onSelectObserver("observer-a")}>Open A</button>
      </div>
    );
  },
}));
vi.mock("../../../src/features/observers/ObserverSidebar", () => ({ ObserverSidebar: () => <p>Observer sidebar</p> }));
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
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Location />
      <ObserverPage wsManager={{} as WsManager} />
    </MemoryRouter>,
  );
}

describe("Observer destination", () => {
  it("opens a canonical dashboard and restores directory state with Back", async () => {
    view();
    fireEvent.change(screen.getByLabelText("Directory search"), { target: { value: "roof" } });
    fireEvent.click(screen.getByText("Open A"));
    expect(await screen.findByRole("heading")).toHaveTextContent("Dashboard observer-a 7d");
    expect(screen.getByRole("status").textContent).toContain("observer=observer-a");
    expect(screen.getByRole("status").textContent).toContain("iata=YOW");
    fireEvent.click(screen.getByText("Browser back"));
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Directory search")).toHaveValue("roof");
    fireEvent.click(screen.getByText("Browser forward"));
    expect(await screen.findByRole("heading")).toHaveTextContent("observer-a");
  });
  it("restores a deep link and has a directory return without prior history", async () => {
    view("?tab=Observers&observer=observer-b&range=30d");
    expect(await screen.findByRole("heading")).toHaveTextContent("Dashboard observer-b 30d");
    const range = screen.getByRole("group", { name: "Time range" });
    const options = within(range).getAllByRole("button");
    expect(options.map(option => option.textContent)).toEqual(["24h", "7d", "30d"]);
    expect(options[2]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Back to observers/ }));
    expect(screen.getByLabelText("Directory search")).toBeVisible();
  });
  it("puts observer actions in the dashboard header and keeps page controls in the top bar", async () => {
    view("?tab=Observers&observer=observer-a&range=7d");
    await screen.findByRole("heading");
    const header = screen.getByTestId("header-actions");
    expect(within(header).getByRole("button", { name: "Compare with…" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Copy observer link" })).toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: /Back to observers/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Compare with…" })).toHaveLength(1);
  });
  it("keeps the directory return on desktop, where the sidebar can't deselect", async () => {
    view("?tab=Observers&observer=observer-a&range=7d");
    await screen.findByRole("heading");
    expect(screen.getByRole("button", { name: /Back to observers/ }).className).not.toMatch(/\bmd:hidden\b/);
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
