import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PacketTableHeader } from "../../../src/features/packets/PacketTableHeader";
import { GRID_TEMPLATE } from "../../../src/features/packets/packet-grid";

describe("PacketTableHeader", () => {
  it("declares every column heading", () => {
    render(<PacketTableHeader />);
    for (const h of ["Hash", "Type", "Route", "Obs", "Hops", "Hash Size", "Summary / Src → Dst", "IATA", "Age"]) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
  });

  it("no longer heads an observer column, which moved into the expansion", () => {
    render(<PacketTableHeader />);
    expect(screen.queryByText("Observer")).not.toBeInTheDocument();
  });

  it("is hidden below md", () => {
    const { container } = render(<PacketTableHeader />);
    expect(container.firstElementChild?.className).toContain("hidden");
    expect(container.firstElementChild?.className).toContain("md:grid");
  });

  it("applies the shared GRID_TEMPLATE so columns align with the row", () => {
    const { container } = render(<PacketTableHeader />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.gridTemplateColumns).toBe(GRID_TEMPLATE);
  });

  it("has exactly 10 cells, one per row column including the chevron spacer", () => {
    const { container } = render(<PacketTableHeader />);
    expect(container.firstElementChild?.children).toHaveLength(10);
  });

  // Regression: the header and the rows are two independent grids. A `ch` track resolves against
  // each one's own font size (header 9px vs row 11px) and an `auto`/`min-content` track against its
  // own content ("HASH" vs "4AE77F09"), so either kind silently drifts the columns apart.
  it("sizes every track in font-independent units so both grids resolve identically", () => {
    expect(GRID_TEMPLATE).not.toMatch(/\bch\b/);
    expect(GRID_TEMPLATE).not.toMatch(/auto|min-content|max-content|fit-content/);
  });

  it("leaves the leading chevron-alignment cell unlabeled and hidden from screen readers", () => {
    const { container } = render(<PacketTableHeader />);
    const first = container.firstElementChild?.children[0];
    expect(first).toHaveAttribute("aria-hidden");
    expect(first?.textContent).toBe("");
  });
});
