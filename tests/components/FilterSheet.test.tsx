import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterSheet, FiltersButton } from "../../src/components/FilterSheet";

describe("FiltersButton", () => {
  it("shows the active count only when there are active filters", () => {
    const { rerender } = render(<FiltersButton activeCount={0} onClick={() => {}} />);
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();

    rerender(<FiltersButton activeCount={3} onClick={() => {}} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(<FiltersButton activeCount={0} onClick={onClick} />);
    fireEvent.click(screen.getByText("Filters"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("FilterSheet", () => {
  it("renders its children and a Done button that closes", () => {
    const onClose = vi.fn();
    render(
      <FilterSheet onClose={onClose}>
        <div>control-content</div>
      </FilterSheet>,
    );
    expect(screen.getByText("control-content")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows Clear all only when onClear is provided and wires it up", () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <FilterSheet onClose={() => {}}>
        <div />
      </FilterSheet>,
    );
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();

    rerender(
      <FilterSheet onClose={() => {}} onClear={onClear}>
        <div />
      </FilterSheet>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <FilterSheet onClose={onClose}>
        <div />
      </FilterSheet>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is a modal dialog for assistive tech", () => {
    render(
      <FilterSheet onClose={() => {}}>
        <div />
      </FilterSheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
