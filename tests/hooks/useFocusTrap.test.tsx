import { useRef, type ReactNode } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useFocusTrap } from "../../src/hooks/useFocusTrap";

function TrapBox({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div ref={ref} tabIndex={-1} data-testid="dialog">
      {children}
    </div>
  );
}

function Harness({ trapped }: { trapped: boolean }) {
  return (
    <div>
      <button data-testid="outside">outside</button>
      {trapped && (
        <TrapBox>
          <button data-testid="first">first</button>
          <button data-testid="last">last</button>
        </TrapBox>
      )}
    </div>
  );
}

describe("useFocusTrap", () => {
  it("focuses the container itself on mount (so the dialog name is announced before its controls)", () => {
    render(<Harness trapped={true} />);
    expect(document.activeElement).toBe(screen.getByTestId("dialog"));
  });

  it("wraps focus to the first element when Tab is pressed on the last", () => {
    render(<Harness trapped={true} />);
    screen.getByTestId("last").focus();
    fireEvent.keyDown(screen.getByTestId("last"), { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("wraps focus to the last element when Shift+Tab is pressed on the first", () => {
    render(<Harness trapped={true} />);
    screen.getByTestId("first").focus();
    fireEvent.keyDown(screen.getByTestId("first"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId("last"));
  });

  it("does not yank focus to <body> on unmount when nothing was focused on open", () => {
    // Opened from a click that left focus on <body> (e.g. a Safari/Firefox button or a non-focusable
    // row). On close we must not call body.focus() and blur whatever the user moved to next.
    const { rerender } = render(<Harness trapped={false} />);
    expect(document.activeElement).toBe(document.body);

    rerender(<Harness trapped={true} />); // trap focuses the container; restoreTo is <body>
    screen.getByTestId("outside").focus(); // focus subsequently moves elsewhere

    rerender(<Harness trapped={false} />); // unmount must leave focus on "outside", not reset to body
    expect(document.activeElement).toBe(screen.getByTestId("outside"));
  });

  it("restores focus to the previously focused element on unmount", () => {
    const { rerender } = render(<Harness trapped={false} />);
    screen.getByTestId("outside").focus();
    expect(document.activeElement).toBe(screen.getByTestId("outside"));

    rerender(<Harness trapped={true} />);
    expect(document.activeElement).toBe(screen.getByTestId("dialog"));

    rerender(<Harness trapped={false} />);
    expect(document.activeElement).toBe(screen.getByTestId("outside"));
  });
});
