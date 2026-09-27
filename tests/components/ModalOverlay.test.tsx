import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModalOverlay } from "../../src/components/ModalOverlay";

function renderOverlay(onClose: () => void) {
  render(
    <ModalOverlay label="Test panel" onClose={onClose}>
      <p data-testid="panel-text">selectable panel text</p>
    </ModalOverlay>,
  );
  return screen.getByRole("dialog", { name: "Test panel" });
}

describe("ModalOverlay", () => {
  it("handles Escape in the active dialog without reaching underlying window handlers", () => {
    const close = vi.fn(); const parent = vi.fn();
    window.addEventListener("keydown", parent);
    try {
      const dialog = renderOverlay(close);
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(close).toHaveBeenCalledOnce();
      expect(parent).not.toHaveBeenCalled();
    } finally { window.removeEventListener("keydown", parent); }
  });
  it("does not dismiss an inactive layer", () => {
    const close = vi.fn();
    render(<ModalOverlay label="Covered" onClose={close} inactive><p>Covered content</p></ModalOverlay>);
    const dialog = screen.getByRole("dialog", { hidden: true });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute("aria-hidden", "true");
  });
  it("closes when a click starts and ends on the backdrop", () => {
    const onClose = vi.fn();
    const backdrop = renderOverlay(onClose);
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when a drag starts inside the panel and releases over the backdrop", () => {
    // regression: selecting text in the panel and releasing over the backdrop fired a click on the
    // backdrop (the common ancestor) and closed the modal
    const onClose = vi.fn();
    const backdrop = renderOverlay(onClose);
    fireEvent.mouseDown(screen.getByTestId("panel-text"));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close on clicks inside the panel", () => {
    const onClose = vi.fn();
    renderOverlay(onClose);
    const text = screen.getByTestId("panel-text");
    fireEvent.mouseDown(text);
    fireEvent.click(text);
    expect(onClose).not.toHaveBeenCalled();
  });
});
