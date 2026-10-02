import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { StatsSubHeader } from "../../../src/features/stats/StatsSubHeader";
import i18n from "../../../src/i18n";

afterEach(() => vi.restoreAllMocks());

describe("translated analytics controls", () => {
  it("keeps archived analytics ranges and has no Observer section", async () => {
    const props = { onTabChange: vi.fn(), onRangeChange: vi.fn() };
    const { rerender } = render(<StatsSubHeader {...props} tab="mesh" range="7d" />);
    expect(screen.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "3d" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30d" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Observer", exact: true })).not.toBeInTheDocument();
    await act(() => i18n.changeLanguage("fr"));
    fireEvent.click(screen.getByRole("button", { name: "7 j" }));
    expect(props.onRangeChange).toHaveBeenCalledWith("7d");
    rerender(<StatsSubHeader {...props} tab="traffic" range="7d" />);
    expect(screen.queryByRole("button", { name: "3 j" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 j" })).toBeInTheDocument();
    rerender(<StatsSubHeader {...props} tab="scopes" range="7d" />);
    expect(screen.getByRole("button", { name: "30 j" })).toBeInTheDocument();
  });

  it("keeps section and range identifiers when labels change", async () => {
    const onTabChange = vi.fn(), onRangeChange = vi.fn();
    render(<StatsSubHeader tab="signal" range="7d" onTabChange={onTabChange} onRangeChange={onRangeChange} />);
    expect(screen.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
    await act(() => i18n.changeLanguage("fr"));
    expect(screen.getByRole("group", { name: "Section des statistiques" })).toBeInTheDocument();
    const range = screen.getByRole("group", { name: "Période" });
    expect(within(range).getByRole("button", { name: "7 j" })).toHaveAttribute("aria-pressed", "true");
    expect(onTabChange).not.toHaveBeenCalled();
    expect(onRangeChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Chemins et hachages" }));
    expect(onTabChange).toHaveBeenCalledWith("paths");
    fireEvent.click(within(range).getByRole("button", { name: "30 j" }));
    expect(onRangeChange).toHaveBeenCalledWith("30d");
  });

  it("uses the same canonical mobile choices and hides ranges for clock drift", async () => {
    const media = window.matchMedia("(max-width: 767px)");
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ ...media, media: query, matches: query === "(max-width: 767px)" }));
    await act(() => i18n.changeLanguage("fr"));
    const onTabChange = vi.fn(), onRangeChange = vi.fn();
    const { rerender } = render(<StatsSubHeader tab="signal" range="24h" onTabChange={onTabChange} onRangeChange={onRangeChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Section/ }));
    fireEvent.click(screen.getByRole("option", { name: "Dérive d’horloge" }));
    expect(onTabChange).toHaveBeenCalledWith("clockdrift");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    rerender(<StatsSubHeader tab="clockdrift" range="24h" onTabChange={onTabChange} onRangeChange={onRangeChange} />);
    expect(screen.queryByRole("group", { name: "Période" })).not.toBeInTheDocument();
    expect(onRangeChange).not.toHaveBeenCalled();
  });
});
