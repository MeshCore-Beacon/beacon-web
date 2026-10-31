import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

interface Drag {
  from: number;
  over: number;
  dx: number;
  dy: number;
  rects: DOMRect[];
}

// Pointer-driven reordering for a grid of cards: the grabbed card follows the pointer and the cards
// between its old and new slot slide into the neighbouring rect, so a drop lands where it looks.
export function useCardDrag(count: number, onReorder: (from: number, to: number) => void) {
  const cards = useRef(new Map<number, HTMLElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const active = useRef(false);

  useEffect(() => () => cleanup.current(), []);

  const start = useCallback((index: number, event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || active.current) return;
    event.preventDefault();
    active.current = true;
    const pointerId = event.pointerId;
    const handle = event.currentTarget;
    handle.setPointerCapture?.(pointerId);
    const rects = Array.from({ length: count }, (_, i) => cards.current.get(i)?.getBoundingClientRect() ?? new DOMRect());
    const origin = { x: event.clientX, y: event.clientY };
    let current: Drag = { from: index, over: index, dx: 0, dy: 0, rects };
    setDrag(current);

    const onMove = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const hit = rects.findIndex((r) => e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom);
      current = { ...current, dx: e.clientX - origin.x, dy: e.clientY - origin.y, over: hit === -1 ? current.over : hit };
      setDrag(current);
    };
    const end = (commit: boolean) => {
      cleanup.current();
      setDrag(null);
      if (commit && current.over !== current.from) onReorder(current.from, current.over);
    };
    const onUp = (e: globalThis.PointerEvent) => { if (e.pointerId === pointerId) end(true); };
    const onCancel = () => end(false);
    const onPointerCancel = (e: globalThis.PointerEvent) => { if (e.pointerId === pointerId) end(false); };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") end(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onCancel);
    handle.addEventListener("lostpointercapture", onPointerCancel);
    cleanup.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onCancel);
      handle.removeEventListener("lostpointercapture", onPointerCancel);
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
      active.current = false;
      cleanup.current = () => {};
    };
  }, [count, onReorder]);

  const style = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    const { from, over, dx, dy, rects } = drag;
    if (index === from) return { transform: `translate(${dx}px, ${dy}px)`, zIndex: 10, position: "relative" };
    // Cards between the two slots take the place of their neighbour on the side the card came from.
    const shift = from < index && index <= over ? -1 : over <= index && index < from ? 1 : 0;
    if (shift === 0) return undefined;
    const to = rects[index + shift]!;
    const own = rects[index]!;
    return { transform: `translate(${to.left - own.left}px, ${to.top - own.top}px)` };
  };

  return {
    dragging: drag?.from ?? null,
    cardProps: (index: number) => ({
      ref: (el: HTMLElement | null) => {
        if (el) cards.current.set(index, el);
        else cards.current.delete(index);
      },
      style: style(index),
      className: drag && drag.from !== index ? "transition-transform duration-150" : undefined,
    }),
    handleProps: (index: number) => ({
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(index, event),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        const to = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : null;
        if (to === null || to < 0 || to >= count) return;
        event.preventDefault();
        onReorder(index, to);
      },
    }),
  };
}

export type CardHandleProps = ReturnType<ReturnType<typeof useCardDrag>["handleProps"]>;
