import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CopyLinkButton } from "../../src/components/CopyLinkButton";

const writeText = vi.fn();

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    writable: true,
    configurable: true,
  });
  writeText.mockClear();
});

describe("CopyLinkButton", () => {
  it("shows the default 'Copy Link' label", () => {
    render(<CopyLinkButton params={{ tab: "Nodes", node: "abc" }} />);
    expect(screen.getByRole("button")).toHaveTextContent("Copy Link");
  });

  it("copies a URL carrying the given params on click", () => {
    render(<CopyLinkButton params={{ tab: "Nodes", node: "abc123" }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = new URL(writeText.mock.calls[0][0]);
    expect(copied.searchParams.get("tab")).toBe("Nodes");
    expect(copied.searchParams.get("node")).toBe("abc123");
  });

  it("swaps to 'Copied' after clicking, then reverts", () => {
    vi.useFakeTimers();
    try {
      render(<CopyLinkButton params={{ tab: "Observers", observer: "xyz" }} />);
      const button = screen.getByRole("button");
      fireEvent.click(button);
      expect(button).toHaveTextContent("Copied");
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(button).toHaveTextContent("Copy Link");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the provided aria-label for the accessible name", () => {
    render(<CopyLinkButton params={{ tab: "Nodes", node: "abc" }} ariaLabel="Copy node link" />);
    expect(screen.getByRole("button", { name: "Copy node link" })).toBeInTheDocument();
  });
});
