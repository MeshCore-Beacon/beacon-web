import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanguageOptions } from "../../src/components/LanguagePicker";
import i18n from "../../src/i18n";

describe("LanguageOptions", () => {
  it("marks the current language, switches to French and reports the pick", async () => {
    const onPick = vi.fn();
    render(<LanguageOptions onPick={onPick} />);
    expect(screen.getByRole("button", { name: "English", exact: true })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Français", exact: true }));

    expect(onPick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.documentElement.lang).toBe("fr"));
    expect(localStorage.getItem("beacon-language")).toBe("fr");
    await act(() => i18n.changeLanguage("en"));
  });
});
