import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanguagePicker } from "../../src/components/LanguagePicker";

describe("LanguagePicker", () => {
  it("opens the language choices, selects French and returns focus to the trigger", async () => {
    render(<LanguagePicker />);
    const trigger = screen.getByRole("button", { name: "Language: English" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English", exact: true })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Français", exact: true }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Langue: Français" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Langue: Français" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(localStorage.getItem("beacon-language")).toBe("fr");
  });

  it("closes with Escape from an option without changing language or losing focus", () => {
    render(<LanguagePicker />);
    const trigger = screen.getByRole("button", { name: "Language: English" });
    fireEvent.click(trigger);
    const french = screen.getByRole("button", { name: "Français", exact: true });
    french.focus();
    fireEvent.keyDown(french, { key: "Escape" });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("closes on an outside click without changing the choice", () => {
    render(<LanguagePicker />);
    const trigger = screen.getByRole("button", { name: "Language: English" });
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
