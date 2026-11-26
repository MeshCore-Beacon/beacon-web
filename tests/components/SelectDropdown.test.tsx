import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SelectDropdown } from "../../src/components/SelectDropdown";
import { setPhone } from "../phone";

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

  it("renders the shared list with radios, and a search row for 9 or more options", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}` }));
    const { container } = render(<SelectDropdown label="Scope" options={many} value="v2" onChange={() => {}} fullWidth allLabel="Any" />);
    fireEvent.click(screen.getByRole("button", { name: /Scope/ }));
    expect(container.querySelectorAll('[data-marker="radio"]')).toHaveLength(10); // Any + 9
    expect(screen.getByPlaceholderText("Filter...")).not.toHaveFocus();
    fireEvent.change(screen.getByPlaceholderText("Filter..."), { target: { value: "item 4" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("keeps the compact desktop trigger when not full width", () => {
    render(<SelectDropdown label="Type" options={options} value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Type/ })).not.toHaveClass("h-14");
  });
});

describe("SelectDropdown sheetOnMobile", () => {
  const original = window.matchMedia;
  afterEach(() => { window.matchMedia = original; });
  const many = Array.from({ length: 9 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}` }));

  it("opens a dialog sheet with the shared option list on a phone", () => {
    setPhone(true);
    const onChange = vi.fn();
    render(<SelectDropdown label="Section" options={many} value="v1" onChange={onChange} hideAll sheetOnMobile />);
    fireEvent.click(screen.getByRole("button", { name: /Section/ }));
    const dialog = screen.getByRole("dialog", { name: "Section" });
    expect(within(dialog).getAllByRole("option")).toHaveLength(9);
    expect(within(dialog).getByRole("option", { name: "Item 1" })).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByPlaceholderText("Filter...")).not.toHaveFocus();
    fireEvent.click(within(dialog).getByRole("option", { name: "Item 3" }));
    expect(onChange).toHaveBeenCalledWith("v3");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the popover on desktop", () => {
    setPhone(false);
    render(<SelectDropdown label="Section" options={many} value="v1" onChange={() => {}} hideAll sheetOnMobile />);
    fireEvent.click(screen.getByRole("button", { name: /Section/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });
});
