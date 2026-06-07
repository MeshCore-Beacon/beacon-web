import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Timestamp } from "../../src/components/Timestamp";

describe("Timestamp", () => {
  it("shows relative text, revealing the absolute time on hover (instant tooltip)", () => {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    render(<Timestamp value={fiveMinAgo} />);
    const el = screen.getByText("5m ago");
    expect(el).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(); // hidden until hover

    fireEvent.mouseEnter(el);
    expect(screen.getByRole("tooltip").textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("renders the absolute string in absolute mode, relative on hover", () => {
    render(<Timestamp value={1717689045123} mode="absolute" />);
    const el = screen.getByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    fireEvent.mouseEnter(el);
    expect(screen.getByRole("tooltip").textContent).toMatch(/ago$/);
  });

  it("includes milliseconds when ms is set", () => {
    render(<Timestamp value={1717689045123} mode="absolute" ms />);
    expect(screen.getByText(/\.123$/)).toBeInTheDocument();
  });
});
