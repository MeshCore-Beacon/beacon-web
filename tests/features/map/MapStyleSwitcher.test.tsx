import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapStyleSwitcher } from "../../../src/features/map/MapStyleSwitcher";
import i18n from "../../../src/i18n";

it("labels the map styles in English", () => {
  render(<MapStyleSwitcher styleId="dark" onChange={vi.fn()} />);
  expect(screen.getByRole("group", { name: "Map style" })).toBeInTheDocument();
  for (const name of ["Dark", "Liberty", "Light"]) expect(screen.getByText(name)).toBeInTheDocument();
});

it("labels the map styles in French", async () => {
  await i18n.changeLanguage("fr");
  render(<MapStyleSwitcher styleId="dark" onChange={vi.fn()} />);
  expect(screen.getByRole("group", { name: "Style de carte" })).toBeInTheDocument();
  for (const name of ["Sombre", "Liberty", "Clair"]) expect(screen.getByText(name)).toBeInTheDocument();
});
