import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { StatsOverview } from "../../../src/features/stats/StatsOverview";
import type { WsManager } from "../../../src/api/ws-manager";

vi.mock("../../../src/features/stats/TrafficTab", () => ({ TrafficTab: ({ range }: { range: string }) => <p>Traffic range {range}</p> }));
vi.mock("../../../src/features/stats/MeshTab", () => ({ MeshTab: () => <p>Mesh charts</p> }));
function Location() { return <output aria-label="Analytics URL">{useLocation().search}</output>; }

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
