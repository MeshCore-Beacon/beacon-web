import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResolvedHopBlock } from "../../../src/features/packets/PathData";
import type { ResolvedHop } from "../../../src/types/api";

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

const singleHop: ResolvedHop = {
  confidence: "high",
  nodes: [{ id: "node-1", name: "Repeater A", publicKey: "deadbeefcafe" }],
};

describe("ResolvedHopBlock (desktop)", () => {
  it("opens the node directly when the single-match block is clicked", () => {
    setMobile(false);
    const onViewNode = vi.fn();
    render(<ResolvedHopBlock hop={singleHop} label="ABC1" onViewNode={onViewNode} />);
    fireEvent.click(screen.getByText("ABC1"));
    expect(onViewNode).toHaveBeenCalledWith("node-1");
  });
});

describe("ResolvedHopBlock (mobile)", () => {
  it("reveals the name popover on tap instead of navigating", () => {
    setMobile(true);
    const onViewNode = vi.fn();
    render(<ResolvedHopBlock hop={singleHop} label="ABC1" onViewNode={onViewNode} />);

    fireEvent.click(screen.getByText("ABC1"));
    // popover shows the resolved name, and we did NOT jump straight into the node
    expect(screen.getByText("Repeater A")).toBeInTheDocument();
    expect(onViewNode).not.toHaveBeenCalled();
  });

  it("opens the node when the name in the popover is tapped", () => {
    setMobile(true);
    const onViewNode = vi.fn();
    render(<ResolvedHopBlock hop={singleHop} label="ABC1" onViewNode={onViewNode} />);

    fireEvent.click(screen.getByText("ABC1"));
    fireEvent.click(screen.getByText("Repeater A"));
    expect(onViewNode).toHaveBeenCalledWith("node-1");
  });

  // A touch device wider than the mobile breakpoint (a tablet, or Chrome's device emulation, which
  // reports no hover even at tablet widths) must still tap-to-toggle — not hover — so the popover
  // doesn't dismiss before the resolved name can be tapped. Modality keys off (hover: hover), not width.
  it("taps to open on a hover-less device even at desktop width", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false, // no hover, and not below the mobile width
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const onViewNode = vi.fn();
    render(<ResolvedHopBlock hop={singleHop} label="ABC1" onViewNode={onViewNode} />);

    fireEvent.click(screen.getByText("ABC1"));
    expect(screen.getByText("Repeater A")).toBeInTheDocument();
    expect(onViewNode).not.toHaveBeenCalled();
  });
});
