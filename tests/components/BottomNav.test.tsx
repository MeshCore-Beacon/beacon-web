import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BottomNav } from "../../src/components/BottomNav";
import i18n from "../../src/i18n";

describe("BottomNav", () => {
  it("puts My Atlas first and preserves its canonical identifier in French", async () => {
    const onTabChange = vi.fn();
    render(<BottomNav activeTab="MyAtlas" onTabChange={onTabChange} />);
    expect(screen.getAllByRole("tab")[0]).toHaveTextContent("My Atlas");
    await act(() => i18n.changeLanguage("fr"));
    fireEvent.click(screen.getByRole("tab", { name: "Mon Atlas" }));
    expect(onTabChange).toHaveBeenCalledWith("MyAtlas");
    fireEvent.click(screen.getByText("Plus"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Nœuds" }));
    expect(onTabChange).toHaveBeenCalledWith("Nodes");
  });
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
});
