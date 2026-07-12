import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CopyButton } from "../../src/components/CopyButton";

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

  it("swaps to 'Copied' after clicking, then reverts", () => {
    vi.useFakeTimers();
    try {
      render(<CopyButton value="deadbeef" />);
      const button = screen.getByRole("button");
      fireEvent.click(button);
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
});
