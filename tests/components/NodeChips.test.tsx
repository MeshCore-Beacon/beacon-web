import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TypeChip, RoleChip, CautionChip, ScopeChip } from "../../src/components/NodeChips";

describe("NodeChips", () => {
  it("tints each known type and matches it case-insensitively", () => {
    const { container } = render(<><TypeChip typeName="REPEATER" /><TypeChip typeName="sensor" /></>);
    const [a, b] = [...container.querySelectorAll("[data-chip=type]")];
    expect(a).toHaveClass("text-secondary");
    expect(b).toHaveClass("text-warn");
  });

  it("draws a glyph-only role chip with an accessible name, and a worded one in the panel", () => {
    const { rerender } = render(<RoleChip role="observer" glyphOnly />);
    expect(screen.getByRole("img", { name: "Observer" })).toBeInTheDocument();
    expect(screen.queryByText("Observer")).not.toBeInTheDocument();
    rerender(<RoleChip role="poller" />);
    expect(screen.getByText("Poller")).toBeInTheDocument();
  });

  it("renders caution and scope text as given", () => {
    render(<><CautionChip>Careful</CautionChip><ScopeChip scope="#yow" /></>);
    expect(screen.getByText("Careful")).toHaveClass("text-[#fb923c]");
    expect(screen.getByText("#yow")).toBeInTheDocument();
  });
});
