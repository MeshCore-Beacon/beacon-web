import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { StatsOverview } from "../../../src/features/stats/StatsOverview";
import type { WsManager } from "../../../src/api/ws-manager";

vi.mock("../../../src/features/stats/TrafficTab", () => ({ TrafficTab: ({ range }: { range: string }) => <p>Traffic range {range}</p> }));
vi.mock("../../../src/features/stats/SignalTab", () => ({ SignalTab: ({ range }: { range: string }) => <p>Signal range {range}</p> }));
vi.mock("../../../src/features/stats/PathsTab", () => ({ PathsTab: ({ range }: { range: string }) => <p>Paths range {range}</p> }));
vi.mock("../../../src/features/stats/MeshTab", () => ({ MeshTab: () => <p>Mesh charts</p> }));
vi.mock("../../../src/features/stats/ScopesTab", () => ({ ScopesTab: () => <p>Scope charts</p> }));
function Location() { return <output aria-label="Analytics URL">{useLocation().search}</output>; }

it("opens Paths & Hashes from a shared URL and retains the region while changing range", () => {
  render(<MemoryRouter initialEntries={["/?tab=Analytics&statsTab=paths&range=24h&iata=YOW"]}><StatsOverview wsManager={{} as WsManager} /><Location /></MemoryRouter>);
  expect(screen.getByText("Paths range 24h")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Paths & Hashes" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "30d" }));
  expect(screen.getByText("Paths range 30d")).toBeInTheDocument();
  expect(screen.getByLabelText("Analytics URL")).toHaveTextContent("iata=YOW");
});

it("opens Signal from a shared URL and retains regional state when changing range", () => {
  render(<MemoryRouter initialEntries={["/?tab=Analytics&statsTab=signal&range=24h&iata=YOW"]}><StatsOverview wsManager={{} as WsManager} /><Location /></MemoryRouter>);
  expect(screen.getByText("Signal range 24h")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "RF / Signal" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "7d" }));
  expect(screen.getByText("Signal range 7d")).toBeInTheDocument();
  expect(screen.getByLabelText("Analytics URL")).toHaveTextContent("iata=YOW");
});

it("opens Traffic from a shared URL and keeps unrelated selections when changing the range", () => {
  render(<MemoryRouter initialEntries={["/?tab=Analytics&statsTab=traffic&range=24h&observerId=kept"]}><StatsOverview wsManager={{} as WsManager} /><Location /></MemoryRouter>);
  expect(screen.getByText("Traffic range 24h")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Traffic" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "30d" }));
  expect(screen.getByText("Traffic range 30d")).toBeInTheDocument();
  expect(screen.getByLabelText("Analytics URL")).toHaveTextContent("observerId=kept");
  fireEvent.click(screen.getByRole("button", { name: "Mesh" }));
  expect(screen.getByText("Mesh charts")).toBeInTheDocument();
});

it("opens Scopes without a misleading range control and preserves the chosen range for Traffic", () => {
  render(<MemoryRouter initialEntries={["/?tab=Analytics&statsTab=scopes&range=30d&iata=YOW"]}><StatsOverview wsManager={{} as WsManager} /><Location /></MemoryRouter>);
  expect(screen.getByText("Scope charts")).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Time range" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Traffic" }));
  expect(screen.getByText("Traffic range 30d")).toBeInTheDocument();
  expect(screen.getByLabelText("Analytics URL")).toHaveTextContent("iata=YOW");
});
