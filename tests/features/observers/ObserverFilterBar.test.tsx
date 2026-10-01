import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObserverFilterBar } from "../../../src/features/observers/ObserverFilterBar";
import i18n from "../../../src/i18n";

function renderBar() {
  return render(
    <ObserverFilterBar
      search=""
      onSearchChange={vi.fn()}
      searchField="name"
      onSearchFieldChange={vi.fn()}
      statusFilter=""
      onStatusChange={vi.fn()}
      typeFilter=""
      onTypeChange={vi.fn()}
      typeOptions={["mqtt"]}
      brokerFilter=""
      onBrokerChange={vi.fn()}
      brokerOptions={["broker-a"]}
      scopeFilter=""
      onScopeChange={vi.fn()}
      scopeOptions={["#ca"]}
    />,
  );
}

it("labels the observer filters in English", () => {
  renderBar();
  expect(screen.getByRole("toolbar", { name: "Observer filters" })).toBeInTheDocument();
  for (const label of ["Status", "Type", "Broker", "Scope"]) expect(screen.getByText(label)).toBeInTheDocument();
});

it("labels the observer filters in French", async () => {
  await i18n.changeLanguage("fr");
  renderBar();
  expect(screen.getByRole("toolbar", { name: "Filtres des observateurs" })).toBeInTheDocument();
  for (const label of ["État", "Courtier", "Portée"]) expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/par nom/)).toBeInTheDocument();
});
