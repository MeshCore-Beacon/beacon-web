import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MultiSelectDropdown } from "../../src/components/MultiSelectDropdown";

describe("MultiSelectDropdown", () => {
  const onWindowKey = vi.fn();
  afterEach(() => window.removeEventListener("keydown", onWindowKey));

  it("closes on Escape without letting an enclosing sheet close too", () => {
    window.addEventListener("keydown", onWindowKey);
    render(<MultiSelectDropdown label="Types" options={[{ value: "a", label: "A" }]} selected={[]} onChange={() => {}} />);
    const trigger = screen.getByRole("button", { name: /Types/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(onWindowKey).not.toHaveBeenCalled();
  });
});

describe("MultiSelectDropdown search", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
  const open = (n: number, fullWidth: boolean) => {
    render(<MultiSelectDropdown label="Types" options={many(n)} selected={[]} onChange={() => {}} fullWidth={fullWidth} searchable />);
    fireEvent.click(screen.getByRole("button", { name: /Types/ }));
  };

  it("does not move focus to the search box when opened in the sheet", () => {
    open(12, true);
    const input = screen.getByPlaceholderText("Filter...");
    expect(input).not.toHaveFocus();
  });

  it("still focuses the search box in the desktop dropdown", () => {
    open(12, false);
    expect(screen.getByPlaceholderText("Filter...")).toHaveFocus();
  });

  it("renders the sheet search at 16px, only for lists longer than 8", () => {
    open(9, true);
    expect(screen.getByPlaceholderText("Filter...")).toHaveClass("text-base");
  });

  it("has no search box in the sheet for 8 options or fewer", () => {
    open(8, true);
    expect(screen.queryByPlaceholderText("Filter...")).not.toBeInTheDocument();
  });

  it("keeps the sheet option list scrollable within the viewport", () => {
    open(12, true);
    const list = screen.getByRole("listbox");
    expect(list).toHaveClass("overflow-y-auto", "overscroll-contain");
    expect(list.className).toMatch(/max-h-\[\d+dvh\]/);
  });

  it("uses the shared list with checkboxes in the sheet and keeps All / None", () => {
    const { container } = render(<MultiSelectDropdown label="Types" options={many(3)} selected={["v1"]} onChange={() => {}} fullWidth />);
    fireEvent.click(screen.getByRole("button", { name: /Types/ }));
    expect(container.querySelectorAll('[data-marker="checkbox"]')).toHaveLength(3);
    expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
  });
});
