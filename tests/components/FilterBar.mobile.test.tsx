import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "../../src/components/FilterBar";

// Force the mobile media query so FilterBar renders the Filters-button + sheet path.
function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => vi.restoreAllMocks());

const baseProps = {
  typeOptions: [{ value: "ADVERT", label: "ADVERT" }],
  routeOptions: [{ value: "0", label: "Flood" }],
  observerOptions: [{ value: "o1", label: "YVR" }],
  scopeOptions: [],
  activeTypes: [] as string[],
  activeRoutes: [] as string[],
  activeObservers: [] as string[],
  activeScopes: [] as string[],
  onTypesChange: () => {},
  onRoutesChange: () => {},
  onObserversChange: () => {},
  onScopesChange: () => {},
  search: "",
  onSearchChange: () => {},
  searchField: "hash" as const,
  onSearchFieldChange: () => {},
  onClear: () => {},
};

describe("FilterBar (mobile)", () => {
  it("hides the inline dropdowns behind a Filters button until opened", () => {
    setMobile(true);
    render(<FilterBar {...baseProps} />);

    // dropdowns are not inline on mobile
    expect(screen.queryByRole("button", { name: /Types/ })).not.toBeInTheDocument();
    const filtersBtn = screen.getByText("Filters");
    expect(filtersBtn).toBeInTheDocument();

    fireEvent.click(filtersBtn);
    // the sheet now exposes the dropdown controls
    expect(screen.getByText("Types")).toBeInTheDocument();
    expect(screen.getByText("Routes")).toBeInTheDocument();
    expect(screen.getByText("Observers")).toBeInTheDocument();
  });

  it("shows the active-filter count on the Filters button", () => {
    setMobile(true);
    render(<FilterBar {...baseProps} activeTypes={["ADVERT"]} activeRoutes={["0"]} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("offers Clear all in the sheet only when filters are active, and calls onClear", () => {
    setMobile(true);
    const onClear = vi.fn();
    render(<FilterBar {...baseProps} activeTypes={["ADVERT"]} onClear={onClear} />);
    fireEvent.click(screen.getByText("Filters"));
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders the inline toolbar (not a Filters button) on desktop", () => {
    setMobile(false);
    render(<FilterBar {...baseProps} />);
    expect(screen.queryByText("Filters")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Types/ })).toBeInTheDocument();
  });
});
