import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BottomNav } from "../../src/components/BottomNav";
import i18n from "../../src/i18n";

describe("BottomNav", () => {
  it("translates an open More sheet without changing the selected tab identifier", async () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="Analytics" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText("More"));
    await act(() => i18n.changeLanguage("fr"));
    expect(screen.getByRole("menu", { name: "Autres onglets" })).toBeInTheDocument();
    expect(screen.getByText("Plus").closest("button")).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Analyses" }));
    expect(onTabChange).toHaveBeenCalledWith("Analytics");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

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
    render(<BottomNav activeTab="Analytics" onTabChange={() => {}} />);
    const more = screen.getByText("More").closest("button")!;
    expect(more.className).toContain("text-primary");
  });

  // iOS drops the click when live content lands mid-tap, so a touch acts on touchend alone
  const tapEnd = (el: Element, x = 0, y = 0) => fireEvent.touchEnd(el, { changedTouches: [{ clientX: x, clientY: y }] });

  it("switches tab on touchend and cancels the trailing click", () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="Packets" onTabChange={onTabChange} />);
    const notPrevented = tapEnd(screen.getByRole("tab", { name: "Channels" }));
    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith("Channels");
    expect(notPrevented).toBe(false);
  });

  it("ignores a touch that lifts off the button", () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="Packets" onTabChange={onTabChange} />);
    tapEnd(screen.getByRole("tab", { name: "Channels" }), 50, 50);
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("opens More and picks an overflow tab by touch", () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="Packets" onTabChange={onTabChange} />);
    tapEnd(screen.getByText("More").closest("button")!);
    tapEnd(screen.getByRole("menuitem", { name: "Routes" }));
    expect(onTabChange).toHaveBeenCalledWith("Routes");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
