import { describe, it, expect, vi } from "vitest";
import "../../../src/i18n";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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
vi.mock("../../../src/features/stats/ObserverTab", () => ({
  ObserverTab: ({ selectedObserverId, range }: { selectedObserverId: string; range: string }) => (
    <h1>
      Dashboard {selectedObserverId} {range}
    </h1>
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
    fireEvent.click(screen.getByRole("button", { name: /Back to observers/ }));
    expect(screen.getByLabelText("Directory search")).toBeVisible();
  });
});
