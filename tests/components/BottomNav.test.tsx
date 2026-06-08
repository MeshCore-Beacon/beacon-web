import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BottomNav } from "../../src/components/BottomNav";

describe("BottomNav", () => {
  it("marks the active primary tab with aria-selected", () => {
    render(<BottomNav activeTab="Map" onTabChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Packets" })).toHaveAttribute("aria-selected", "false");
  });

  it("opens the More sheet and selects an overflow tab", () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="Packets" onTabChange={onTabChange} />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("More"));
    expect(screen.getByRole("menu", { name: "More tabs" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Routes" }));
    expect(onTabChange).toHaveBeenCalledWith("Routes");
    // sheet closes after a pick
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("highlights More when an overflow tab is active", () => {
    render(<BottomNav activeTab="Stats" onTabChange={() => {}} />);
    const more = screen.getByText("More").closest("button")!;
    expect(more.className).toContain("text-primary");
  });
});
