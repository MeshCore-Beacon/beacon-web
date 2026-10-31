import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useCardDrag } from "../../../src/features/atlas/useCardDrag";

const onReorder = vi.fn();

// Three cards in one row, 100px apart, so pointer positions map to slots without layout.
function Grid() {
  const drag = useCardDrag(3, onReorder);
  return (
    <div>
      {[0, 1, 2].map((index) => (
        <div key={index} data-testid={`card-${index}`} {...drag.cardProps(index)}>
          <button type="button" aria-label={`handle ${index}`} {...drag.handleProps(index)} />
        </div>
      ))}
    </div>
  );
}

function mount() {
  render(<Grid />);
  [0, 1, 2].forEach((index) => {
    screen.getByTestId(`card-${index}`).getBoundingClientRect = () =>
      ({ left: index * 100, right: index * 100 + 100, top: 0, bottom: 100, width: 100, height: 100, x: index * 100, y: 0, toJSON() {} }) as DOMRect;
  });
}
const move = (x: number, y = 50) => pointer("pointermove", window, 0, x, y);
const drop = () => pointer("pointerup", window, 0);
const pointer = (type: string, target: Element | Window, id: number, x = 50, y = 50) => {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: id });
  fireEvent(target, event);
};

beforeEach(() => vi.clearAllMocks());

describe("useCardDrag", () => {
  it("ignores movement and release from another pointer", () => {
    mount();
    pointer("pointerdown", screen.getByLabelText("handle 0"), 1);
    pointer("pointermove", window, 2, 250);
    pointer("pointerup", window, 2);
    expect(onReorder).not.toHaveBeenCalled();
    pointer("pointermove", window, 1, 150);
    pointer("pointerup", window, 1);
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(0, 1);
  });

  it("ignores a second drag start and removes the first drag's listeners on drop", () => {
    mount();
    pointer("pointerdown", screen.getByLabelText("handle 0"), 1);
    pointer("pointerdown", screen.getByLabelText("handle 1"), 2, 150);
    pointer("pointermove", window, 1, 250);
    pointer("pointerup", window, 1);
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(0, 2);
    pointer("pointermove", window, 2, 150);
    pointer("pointerup", window, 2);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("card-0").style.transform).toBe("");
  });

  it("cancels when the window loses focus", () => {
    mount();
    pointer("pointerdown", screen.getByLabelText("handle 0"), 1);
    pointer("pointermove", window, 1, 250);
    fireEvent.blur(window);
    pointer("pointerup", window, 1);
    expect(onReorder).not.toHaveBeenCalled();
    expect(screen.getByTestId("card-0").style.transform).toBe("");
  });

  it("moves the dragged card with the pointer and slides the others out of its way", () => {
    mount();
    pointer("pointerdown", screen.getByLabelText("handle 0"), 0);
    move(250);
    expect(screen.getByTestId("card-0")).toHaveStyle({ transform: "translate(200px, 0px)" });
    expect(screen.getByTestId("card-1")).toHaveStyle({ transform: "translate(-100px, 0px)" });
    expect(screen.getByTestId("card-2")).toHaveStyle({ transform: "translate(-100px, 0px)" });
    drop();
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(screen.getByTestId("card-0").style.transform).toBe("");
  });

  it("slides cards forward when dragging towards the start", () => {
    mount();
    pointer("pointerdown", screen.getByLabelText("handle 2"), 0, 250);
    move(120);
    expect(screen.getByTestId("card-1")).toHaveStyle({ transform: "translate(100px, 0px)" });
    expect(screen.getByTestId("card-0").style.transform).toBe("");
    drop();
    expect(onReorder).toHaveBeenCalledWith(2, 1);
  });

  it("does nothing on a drop in the same slot or outside every card", () => {
    mount();
    pointer("pointerdown", screen.getByLabelText("handle 1"), 0, 150);
    move(160);
    move(160, 900);
    drop();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("cancels on Escape", () => {
    mount();
    pointer("pointerdown", screen.getByLabelText("handle 0"), 0);
    move(250);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("card-0").style.transform).toBe("");
    drop();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("moves one slot with the arrow keys on the handle, within bounds", () => {
    mount();
    fireEvent.keyDown(screen.getByLabelText("handle 0"), { key: "ArrowLeft" });
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("handle 0"), { key: "ArrowRight" });
    expect(onReorder).toHaveBeenCalledWith(0, 1);
    fireEvent.keyDown(screen.getByLabelText("handle 2"), { key: "ArrowRight" });
    expect(onReorder).toHaveBeenCalledTimes(1);
  });
});
