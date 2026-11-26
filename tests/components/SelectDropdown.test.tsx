import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SelectDropdown } from "../../src/components/SelectDropdown";

const options = [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }];

describe("SelectDropdown in the filter sheet", () => {
  it("exposes its label and current value on the field", () => {
    render(<SelectDropdown label="Type" options={options} value="b" onChange={() => {}} fullWidth />);
    const field = screen.getByRole("button", { name: /Type/ });
    expect(within(field).getByText("Type")).toBeInTheDocument();
    expect(within(field).getByText("Beta")).toBeInTheDocument();
    expect(field).toHaveClass("h-14");
  });

  it("shows the all label when nothing is chosen", () => {
    render(<SelectDropdown label="Type" options={options} value="" onChange={() => {}} fullWidth allLabel="Any" />);
    expect(within(screen.getByRole("button", { name: /Type/ })).getByText("Any")).toBeInTheDocument();
  });

  it("marks the selected option in the open list, with 44px rows", () => {
    render(<SelectDropdown label="Type" options={options} value="b" onChange={() => {}} fullWidth />);
    const field = screen.getByRole("button", { name: /Type/ });
    fireEvent.click(field);
    expect(field).toHaveAttribute("aria-expanded", "true");
    const selected = screen.getByRole("option", { name: "Beta" });
    expect(selected).toHaveAttribute("aria-selected", "true");
    expect(selected).toHaveClass("min-h-11");
    expect(screen.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "false");
  });

  it("keeps the compact desktop trigger when not full width", () => {
    render(<SelectDropdown label="Type" options={options} value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Type/ })).not.toHaveClass("h-14");
  });
});
