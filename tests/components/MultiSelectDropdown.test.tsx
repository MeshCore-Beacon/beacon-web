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
