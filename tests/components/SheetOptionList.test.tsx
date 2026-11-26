import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SheetOptionList } from "../../src/components/SheetOptionList";

const many = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
const base = { isSelected: (v: string) => v === "v1", onPick: () => {} };

describe("SheetOptionList", () => {
  it("draws a round radio per row in single mode and a square checkbox in multi mode", () => {
    const { container, rerender } = render(<SheetOptionList mode="single" options={many(3)} {...base} />);
    expect(container.querySelectorAll('[data-marker="radio"]')).toHaveLength(3);
    expect(container.querySelector('[data-marker="radio"]')).toHaveClass("rounded-full");
    rerender(<SheetOptionList mode="multi" options={many(3)} {...base} />);
    expect(container.querySelectorAll('[data-marker="checkbox"]')).toHaveLength(3);
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-multiselectable", "true");
  });

  it("marks the selected row and keeps rows at least 44px", () => {
    render(<SheetOptionList mode="single" options={many(3)} {...base} />);
    const row = screen.getByRole("option", { name: "Option 1" });
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(row).toHaveClass("bg-bg-raised", "min-h-11");
    expect(screen.getByRole("option", { name: "Option 0" })).toHaveAttribute("aria-selected", "false");
  });

  it("shows the search row only above 8 options, never focused, at 16px", () => {
    const { rerender } = render(<SheetOptionList mode="single" options={many(8)} {...base} />);
    expect(screen.queryByPlaceholderText("Filter...")).not.toBeInTheDocument();
    rerender(<SheetOptionList mode="single" options={many(9)} {...base} />);
    const input = screen.getByPlaceholderText("Filter...");
    expect(input).toHaveClass("text-base");
    expect(input).not.toHaveFocus();
  });

  it("filters rows as you type and shows the no-matches line", () => {
    render(<SheetOptionList mode="single" options={many(12)} {...base} />);
    const input = screen.getByPlaceholderText("Filter...");
    fireEvent.change(input, { target: { value: "option 11" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("puts the first row ahead of the options and hides it while searching", () => {
    const onPick = vi.fn();
    render(<SheetOptionList mode="single" options={many(12)} {...base} firstRow={{ label: "Any", selected: false, onPick }} />);
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Any");
    fireEvent.click(screen.getByRole("option", { name: "Any" }));
    expect(onPick).toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Filter..."), { target: { value: "option 3" } });
    expect(screen.queryByRole("option", { name: "Any" })).not.toBeInTheDocument();
  });

  it("scrolls inside the sheet", () => {
    render(<SheetOptionList mode="multi" options={many(12)} {...base} />);
    const list = screen.getByRole("listbox");
    expect(list).toHaveClass("overflow-y-auto", "overscroll-contain");
    expect(list.className).toMatch(/max-h-\[\d+dvh\]/);
  });
});
