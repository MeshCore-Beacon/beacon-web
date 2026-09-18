import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dropdown } from "../../src/components/Dropdown";
import { FilterSheet } from "../../src/components/FilterSheet";

function TestDropdown() {
  return (
    <Dropdown
      renderTrigger={({ toggle }) => (
        <button type="button" onClick={toggle}>trigger</button>
      )}
    >
      {() => <div data-testid="dropdown-panel">option</div>}
    </Dropdown>
  );
}

describe("Dropdown", () => {
  it("closes on Escape", () => {
    render(<TestDropdown />);
    fireEvent.click(screen.getByText("trigger"));
    expect(screen.getByTestId("dropdown-panel")).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("dropdown-panel")).not.toBeInTheDocument();
  });

  it("Escape closes only the open dropdown, not the sheet underneath", () => {
    // regression: Escape in an open dropdown inside the mobile FilterSheet closed both layers
    const onClose = vi.fn();
    render(
      <FilterSheet onClose={onClose}>
        <TestDropdown />
      </FilterSheet>,
    );
    fireEvent.click(screen.getByText("trigger"));
    expect(screen.getByTestId("dropdown-panel")).toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("dropdown-panel")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // with the dropdown closed, Escape reaches the sheet
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Dropdown align", () => {
  it("left-below-md anchors left on phones and flips to right at md", () => {
    render(
      <Dropdown align="left-below-md" renderTrigger={({ toggle }) => <button type="button" onClick={toggle}>trigger</button>}>
        {() => <div data-testid="dropdown-panel">option</div>}
      </Dropdown>,
    );
    fireEvent.click(screen.getByText("trigger"));
    const panel = screen.getByTestId("dropdown-panel").parentElement!;
    expect(panel.className).toContain("left-0");
    expect(panel.className).toContain("md:left-auto");
    expect(panel.className).toContain("md:right-0");
  });
});
