import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DetailPanel } from "../../src/components/DetailPanel";

function renderPanel(props: { collapsible?: boolean; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  render(
    <DetailPanel title="Node Detail" onClose={onClose} collapsible={props.collapsible}>
      <p data-testid="body">neighbor details</p>
    </DetailPanel>,
  );
  return { onClose };
}

describe("DetailPanel", () => {
  it("renders no minimize control unless collapsible", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /minimize/i })).toBeNull();
  });

  it("minimizes without closing, keeping the entity selected", () => {
    const { onClose } = renderPanel({ collapsible: true });
    fireEvent.click(screen.getByRole("button", { name: "Minimize detail panel" }));
    expect(onClose).not.toHaveBeenCalled();
    // still selected: the content stays mounted (just visually collapsed on mobile)
    expect(screen.getByTestId("body")).toBeTruthy();
    // the control now offers to expand again
    expect(screen.getByRole("button", { name: "Expand detail panel" })).toBeTruthy();
  });

  it("toggles back to expanded", () => {
    renderPanel({ collapsible: true });
    fireEvent.click(screen.getByRole("button", { name: "Minimize detail panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand detail panel" }));
    expect(screen.getByRole("button", { name: "Minimize detail panel" })).toBeTruthy();
  });

  it("still closes via the close button", () => {
    const { onClose } = renderPanel({ collapsible: true });
    fireEvent.click(screen.getByRole("button", { name: "Close detail panel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
