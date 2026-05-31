import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentedControl } from "../../../src/features/map/SegmentedControl";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
];

describe("SegmentedControl", () => {
  it("renders one button per option inside a labelled group", () => {
    render(<SegmentedControl ariaLabel="Test group" options={OPTIONS} value="a" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: "Test group" })).toBeInTheDocument();
    for (const o of OPTIONS) {
      expect(screen.getByRole("button", { name: o.label })).toBeInTheDocument();
    }
  });

  it("marks the active option with aria-pressed=true and others false", () => {
    render(<SegmentedControl ariaLabel="Test" options={OPTIONS} value="b" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Bravo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the option value when clicked", () => {
    const onChange = vi.fn();
    render(<SegmentedControl ariaLabel="Test" options={OPTIONS} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Charlie" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("supports the wrap variant with the same semantics", () => {
    const onChange = vi.fn();
    render(<SegmentedControl wrap ariaLabel="Wrapped" options={OPTIONS} value="a" onChange={onChange} />);
    expect(screen.getByRole("group", { name: "Wrapped" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Bravo" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
