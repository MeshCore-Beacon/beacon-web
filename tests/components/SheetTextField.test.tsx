import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SheetTextField } from "../../src/components/SheetTextField";
import { SelectDropdown } from "../../src/components/SelectDropdown";
import { FIELD_LABEL_CLASS } from "../../src/components/sheet-field";

describe("SheetTextField", () => {
  it("shares the floating label class (and mono font) with the select field", () => {
    render(<>
      <SheetTextField label="From hash" value="" onChange={() => {}} />
      <SelectDropdown label="Areas" options={[]} value="" onChange={() => {}} fullWidth />
    </>);
    const textLabel = screen.getByText("From hash");
    const selectLabel = screen.getByText("Areas");
    expect(textLabel.className).toBe(selectLabel.className);
    expect(textLabel.className).toBe(FIELD_LABEL_CLASS);
    expect(textLabel).toHaveClass("font-mono");
  });

  it("uses the mono font and 16px text for the input, never focused", () => {
    render(<SheetTextField label="From hash" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("From hash");
    expect(input).toHaveClass("font-mono", "text-base");
    expect(input).not.toHaveFocus();
  });
});
