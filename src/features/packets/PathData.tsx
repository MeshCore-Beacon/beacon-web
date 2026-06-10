import { useRef, useState, useEffect, useLayoutEffect, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHasHover } from "../../hooks/useMediaQuery";
import { formatSnr, snrLevel, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import type { ResolvedHop, ResolvedNode } from "../../types/api";
import type { PathConfidence } from "../../types/enums";

// hash block tint by resolution confidence
const HOP_BLOCK_CLASSES: Record<PathConfidence, string> = {
  high: "bg-green/8 text-green",
  ambiguous: "bg-warn/8 text-warn",
  none: "bg-text-muted/8 text-text-dim",
};

function nodeLabel(node: ResolvedNode): string {
  return node.name ?? node.publicKey.slice(0, 8);
}

// Portals to <body> so the drawer's overflow doesn't clip it; a close delay bridges the mouse gap.
function HopPopover({ hop, onViewNode, showSnr = true, children }: {
  hop: ResolvedHop | undefined;
  onViewNode?: (nodeId: string) => void;
  showSnr?: boolean;
  children: ReactNode;
}) {
  const hasHover = useHasHover();
  const ref = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const closeTimer = useRef<number | null>(null);

  const nodes = hop?.nodes ?? [];
  const clickable = nodes.length > 0 && !!onViewNode;

  function open() {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setAnchor(rect);
  }
  function scheduleClose() {
    closeTimer.current = window.setTimeout(() => setAnchor(null), 120);
  }
  // touch: tap toggles; stopPropagation so a hop tap doesn't also select the Route row/card it's in
  function toggle(e: ReactMouseEvent) {
    e.stopPropagation();
    setAnchor((a) => (a ? null : ref.current?.getBoundingClientRect() ?? null));
  }

  // A fixed-position popover would drift away from its hash block on scroll/resize, so close it.
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  // clear any pending close timer on unmount
  useEffect(() => () => {
    if (closeTimer.current != null) clearTimeout(closeTimer.current);
  }, []);

  // touch: a tap outside the block and its popover dismisses it
  useEffect(() => {
    if (!anchor || hasHover) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !tipRef.current?.contains(t)) setAnchor(null);
    }
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [anchor, hasHover]);

  // Center above the block, then clamp on-screen and flip below if it would clip the top edge.
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
      onMouseEnter={hasHover ? open : undefined}
      onMouseLeave={hasHover ? scheduleClose : undefined}
      onClick={hasHover ? undefined : toggle}
      className="inline-flex"
    >
      {children}
      {anchor &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            style={{ left: pos.left, top: pos.top }}
            onMouseEnter={hasHover && clickable ? open : undefined}
            onMouseLeave={hasHover && clickable ? scheduleClose : undefined}
            className={`fixed z-50 flex flex-col gap-0.5 whitespace-nowrap rounded border border-border bg-bg-raised px-2 py-1 font-mono text-[11px] text-text-normal shadow-lg ${clickable ? "" : "pointer-events-none"}`}
          >
            {nodes.length === 0 ? (
              "No Path Resolutions Available"
            ) : clickable ? (
              nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAnchor(null);
                    onViewNode?.(node.id);
                  }}
                  className="cursor-pointer text-left hover:text-primary hover:underline"
                >
                  {nodeLabel(node)}
                </button>
              ))
            ) : (
              nodes.map((node) => <span key={node.id}>{nodeLabel(node)}</span>)
            )}
            {showSnr && hop?.snr != null && (
              <span className="text-text-dim">
                SNR <span className={SIGNAL_LEVEL_CLASSES[snrLevel(hop.snr) ?? "bad"]}>{formatSnr(hop.snr)}</span>
              </span>
            )}
          </span>,
          document.body,
        )}
    </span>
  );
}

// One hash block + its hop popover. Shared by PathData and the trace payload so both resolve identically.
export function ResolvedHopBlock({ hop, label, onViewNode, showSnr = true }: {
  hop: ResolvedHop | undefined;
  label: string;
  onViewNode?: (nodeId: string) => void;
  showSnr?: boolean;
}) {
  const hasHover = useHasHover();
  const confidence: PathConfidence = hop?.confidence ?? "none";
  const blockClass = `px-1.5 py-px rounded-sm font-semibold ${HOP_BLOCK_CLASSES[confidence]}`;
  // mouse-only shortcut: a lone resolved match makes the block jump straight to the node (touch taps open the popover)
  const single = hasHover && hop && hop.nodes.length === 1 && onViewNode ? hop.nodes[0] : undefined;
  return (
    <HopPopover hop={hop} onViewNode={onViewNode} showSnr={showSnr}>
      {single ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewNode?.(single.id);
          }}
          className={`${blockClass} cursor-pointer hover:brightness-125`}
        >
          {label}
        </button>
      ) : (
        <span className={blockClass}>{label}</span>
      )}
    </HopPopover>
  );
}

// resolvedPath[i] lines up with the i-th hash (backend appends one hop per hash, in order).
export function PathData({ pathBytes, hashSize, resolvedPath, size = "md", onViewNode }: {
  pathBytes: string;
  hashSize: number;
  resolvedPath: ResolvedHop[];
  size?: "sm" | "md";
  onViewNode?: (nodeId: string) => void;
}) {
  const chars = hashSize * 2;
  if (chars <= 0) return null; // splitter would be an invalid `.{1,0}` RegExp, and there's nothing to show anyway
  const hops = pathBytes.match(new RegExp(`.{1,${chars}}`, "g")) ?? [];
  const textClass = size === "sm" ? "text-[11px]" : "text-[13px]";

  return (
    <div className={`flex flex-wrap items-center gap-1 font-mono ${textClass}`}>
      {hops.map((hop, i) => (
        <span key={i} className="contents">
          {i > 0 && <span className="text-text-dim" aria-hidden>→</span>}
          <ResolvedHopBlock hop={resolvedPath[i]} label={hop.toUpperCase()} onViewNode={onViewNode} />
        </span>
      ))}
    </div>
  );
}
