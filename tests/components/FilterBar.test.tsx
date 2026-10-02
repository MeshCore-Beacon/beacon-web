import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "../../src/components/FilterBar";
import i18n from "../../src/i18n";

const noop = () => {};
const props = {
  typeOptions: [{ value: "ADVERT", label: "ADVERT" }],
  routeOptions: [{ value: "0", label: "Flood" }],
  observerOptions: [{ value: "o1", label: "YVR" }],
  scopeOptions: [{ value: "s1", label: "#east" }],
  activeTypes: ["ADVERT"],
  activeRoutes: [] as string[],
  activeObservers: [] as string[],
  activeScopes: [] as string[],
  onTypesChange: noop,
  onRoutesChange: noop,
  onObserversChange: noop,
  onScopesChange: noop,
  search: "",
  onSearchChange: noop,
  searchField: "hash" as const,
  onSearchFieldChange: noop,
  onClear: noop,
};

describe("FilterBar in French", () => {
  it("translates the toolbar, search field, and dropdown controls", async () => {
    await i18n.changeLanguage("fr");
    render(<FilterBar {...props} />);
    expect(screen.getByRole("toolbar", { name: "Filtres de paquets" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Rechercher par hash…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Effacer" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Observateurs/ }));
    expect(screen.getByPlaceholderText("Filtrer…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tous" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aucun" })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Filtrer…"), { target: { value: "zzz" } });
    expect(screen.getByText("Aucun résultat")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Hash/ }));
    expect(screen.getByRole("button", { name: "Dernier trajet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Charge utile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Portée/ })).toBeInTheDocument();
  });

  it("keeps the English placeholder wording", () => {
    render(<FilterBar {...props} searchField="path" />);
    expect(screen.getByPlaceholderText("Search by latest path...")).toBeInTheDocument();
  });
});
