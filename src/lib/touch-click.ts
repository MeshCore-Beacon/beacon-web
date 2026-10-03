import type { TouchEvent } from "react";

// iOS Safari drops a tap's click when new tappable content appears mid-tap (the live packet list
// does that constantly), so a touch acts on touchend and cancels the click iOS might still send.
export function touchClick(onActivate: () => void) {
  return {
    onClick: onActivate,
    onTouchEnd: (e: TouchEvent<HTMLElement>) => {
      const touch = e.changedTouches[0];
      const r = e.currentTarget.getBoundingClientRect();
      if (!touch || touch.clientX < r.left || touch.clientX > r.right || touch.clientY < r.top || touch.clientY > r.bottom) return;
      e.preventDefault();
      onActivate();
    },
  };
}
