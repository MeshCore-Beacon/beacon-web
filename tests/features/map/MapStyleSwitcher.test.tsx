import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapStyleSwitcher } from "../../../src/features/map/MapStyleSwitcher";
import { MAP_STYLES } from "../../../src/features/map/types";

describe("MapStyleSwitcher", () => {
  it("renders one button per map style", () => {
    render(<MapStyleSwitcher styleId="dark" onChange={() => {}} />);
    for (const s of MAP_STYLES) {
      expect(screen.getByRole("button", { name: s.name })).toBeInTheDocument();
    }
  });

  it("marks the active style with aria-pressed=true and others false", () => {
    render(<MapStyleSwitcher styleId="liberty" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Liberty" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the style id when a button is clicked", () => {
    const onChange = vi.fn();
    render(<MapStyleSwitcher styleId="dark" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(onChange).toHaveBeenCalledWith("positron");
  });

  it("exposes the group with an accessible label", () => {
    render(<MapStyleSwitcher styleId="dark" onChange={() => {}} />);
    expect(screen.getByRole("group", { name: /map style/i })).toBeInTheDocument();
  });
});
