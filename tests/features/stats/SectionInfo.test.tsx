import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StatsOverview } from "../../../src/features/stats/StatsOverview";
import { SectionInfo } from "../../../src/features/stats/SectionInfo";
import type { WsManager } from "../../../src/api/ws-manager";

vi.mock("../../../src/features/stats/ScopesTab", async () => {
  const { SectionInfo } = await import("../../../src/features/stats/SectionInfo");
  return { ScopesTab: () => <main><SectionInfo text="About scopes" /></main> };
});

it("shows a section's info beside the section chooser", () => {
  render(<MemoryRouter initialEntries={["/?tab=Analytics&statsTab=scopes"]}><StatsOverview wsManager={{} as WsManager} /></MemoryRouter>);
  const tip = screen.getByRole("button", { name: /About scopes/ });
  expect(tip.closest("[data-section-info]")).toBeInTheDocument();
  expect(screen.getByRole("main")).not.toContainElement(tip);
});

it("keeps the info in place outside the analytics bar", () => {
  render(<main><SectionInfo text="Standalone" /></main>);
  expect(screen.getByRole("main")).toContainElement(screen.getByRole("button", { name: /Standalone/ }));
});
