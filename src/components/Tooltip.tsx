import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Lightweight hover tooltip. Renders into <body> with fixed positioning so it's never clipped by a
// scrolling/overflow parent (e.g. the data tables), and sits centered just above the target.
export function Tooltip({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setAnchor(rect);
  }
  const hide = () => setAnchor(null);

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
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} className={`inline-flex ${className}`}>
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
