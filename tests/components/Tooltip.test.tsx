import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tooltip } from "../../src/components/Tooltip";

// mobile/touch == no hover-capable pointer; desktop == has hover. Interaction modality keys off
// (hover: hover), not viewport width.
function setMobile(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: /hover: hover/.test(query) ? !mobile : mobile,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => vi.restoreAllMocks());

describe("Tooltip (desktop)", () => {
  it("shows on mouse enter and hides on mouse leave", () => {
    setMobile(false);
    render(<Tooltip label="tip text"><span>target</span></Tooltip>);
    const trigger = screen.getByText("target");

    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("tip text");

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not open on click", () => {
    setMobile(false);
    render(<Tooltip label="tip text"><span>target</span></Tooltip>);
    fireEvent.click(screen.getByText("target"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("Tooltip (mobile)", () => {
  it("toggles on tap and dismisses on an outside pointerdown", () => {
    setMobile(true);
    render(
      <div>
        <Tooltip label="tip text"><span>target</span></Tooltip>
        <span>outside</span>
      </div>,
    );
    const trigger = screen.getByText("target");

    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("tip text");

    // a tap outside the trigger closes it
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("stops the tap from reaching a parent click handler", () => {
    setMobile(true);
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <Tooltip label="tip text"><span>target</span></Tooltip>
      </div>,
    );
    fireEvent.click(screen.getByText("target"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
