import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CopyButton } from "../../src/components/CopyButton";
import i18n from "../../src/i18n";

const writeText = vi.fn();

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    writable: true,
    configurable: true,
  });
  writeText.mockClear();
});

describe("CopyButton", () => {
  it("shows the default 'Copy' label", () => {
    render(<CopyButton value="deadbeef" />);
    expect(screen.getByRole("button")).toHaveTextContent("Copy");
  });

  it("writes the full value to the clipboard on click", () => {
    const key = "0123456789abcdef0123456789abcdef";
    render(<CopyButton value={key} />);
    fireEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith(key);
  });

  it("swaps to 'Copied' after clicking, then reverts", async () => {
    vi.useFakeTimers();
    try {
      render(<CopyButton value="deadbeef" />);
      const button = screen.getByRole("button");
      fireEvent.click(button);
      await act(async () => {});
      expect(button).toHaveTextContent("Copied");
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(button).toHaveTextContent("Copy");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the provided aria-label for the accessible name", () => {
    render(<CopyButton value="deadbeef" ariaLabel="Copy public key" />);
    expect(screen.getByRole("button", { name: "Copy public key" })).toBeInTheDocument();
  });

  it("defaults to French labels in French", async () => {
    await i18n.changeLanguage("fr");
    render(<CopyButton value="deadbeef" />);
    const button = screen.getByRole("button", { name: "Copier" });
    fireEvent.click(button);
    await act(async () => {});
    expect(button).toHaveTextContent("Copié");
  });

  it("doesn't claim success when the clipboard API is missing (plain http)", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, writable: true, configurable: true });
    render(<CopyButton value="deadbeef" />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    await act(async () => {});
    expect(button).not.toHaveTextContent("Copied");
    expect(button).toHaveTextContent("Copy failed");
  });

  it("shows 'Copied' only once the write resolves, and a failure when it rejects", async () => {
    let reject!: (e: Error) => void;
    writeText.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    render(<CopyButton value="deadbeef" />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button).not.toHaveTextContent("Copied");
    await act(async () => reject(new Error("denied")));
    expect(button).toHaveTextContent("Copy failed");
  });
});
