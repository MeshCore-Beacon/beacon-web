import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ViewTabs } from "../../../src/features/atlas/ViewTabs";
import type { AtlasView } from "../../../src/features/atlas/atlas";

const NAMES: Record<string, string> = { analytics: "Analytics", heard: "Heard by", observer: "Observer", telemetry: "Telemetry", poller: "Poller" };

function mount(views: AtlasView[], value: AtlasView, onChange = vi.fn()) {
  render(<ViewTabs views={views} value={value} onChange={onChange} ariaLabel="Card view" label={(view) => NAMES[view]!} />);
  return { onChange, tabs: within(screen.getByRole("group", { name: "Card view" })).getAllByRole("button") };
}

describe("ViewTabs", () => {
  it("draws an icon on every tab and names only the open one", () => {
    const { tabs } = mount(["analytics", "heard", "observer", "telemetry"], "observer");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["", "", "Observer", ""]);
    for (const tab of tabs) expect(tab.querySelectorAll("svg[aria-hidden]")).toHaveLength(1);
  });

  it("gives every tab its name for assistive tech and marks the open one pressed", () => {
    const { tabs } = mount(["analytics", "heard", "observer", "telemetry"], "heard");
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual(["Analytics", "Heard by", "Observer", "Telemetry"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "false"]);
  });

  it("keeps closed tabs a fixed width and lets the open one take the rest", () => {
    const { tabs } = mount(["analytics", "heard"], "analytics");
    expect(tabs[0]!.parentElement).toHaveClass("flex-1");
    expect(tabs[1]!.parentElement).toHaveClass("w-11", "shrink-0");
  });

  it("opens a tab on click and names an icon in a tooltip on hover", () => {
    const { tabs, onChange } = mount(["analytics", "heard"], "analytics");
    fireEvent.mouseEnter(tabs[1]!.parentElement!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Heard by");
    fireEvent.mouseLeave(tabs[1]!.parentElement!);
    fireEvent.mouseEnter(tabs[0]!.parentElement!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(tabs[1]!);
    expect(onChange).toHaveBeenCalledWith("heard");
  });
});
