import { useState, useRef, useEffect, useLayoutEffect, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHasHover } from "../hooks/useMediaQuery";

// Portals to <body> with fixed positioning so overflow parents (the data tables) can't clip it.
// Hover reveals with a mouse; on touch it toggles on tap and dismisses on an outside tap.
export function Tooltip({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  const hasHover = useHasHover();
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setAnchor(rect);
  }
  const hide = () => setAnchor(null);

  // touch: tap toggles; stopPropagation so a badge tap doesn't also hit the row/button it sits in
  function toggle(e: ReactMouseEvent) {
    e.stopPropagation();
    setAnchor((a) => (a ? null : ref.current?.getBoundingClientRect() ?? null));
  }

  // A fixed-position tip would detach from its target on scroll/resize, so close it rather than track.
  useEffect(() => {
    if (!anchor) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [anchor]);

  // touch: a tap outside the trigger dismisses the tip
  useEffect(() => {
    if (!anchor || hasHover) return;
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setAnchor(null);
    }
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [anchor, hasHover]);

  // Center above the target, then clamp on-screen and flip below if it would clip the top edge.
  useLayoutEffect(() => {
    if (!anchor || !tipRef.current) return;
    const { offsetWidth: w, offsetHeight: h } = tipRef.current;
    const m = 6;
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - w / 2, m), window.innerWidth - w - m);
    const above = anchor.top - m - h;
    setPos({ left, top: above >= m ? above : anchor.bottom + m });
  }, [anchor]);

  return (
    <span
      ref={ref}
      onMouseEnter={hasHover ? show : undefined}
      onMouseLeave={hasHover ? hide : undefined}
      onClick={hasHover ? undefined : toggle}
      className={`inline-flex ${className}`}
    >
      {children}
      {anchor &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            style={{ left: pos.left, top: pos.top }}
            className="fixed z-50 pointer-events-none whitespace-nowrap rounded border border-border bg-bg-raised px-2 py-1 font-mono text-[11px] text-text-normal shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
