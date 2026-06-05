import { useRef, useState, useEffect, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

// Popover anchored above a path block. Opens on hover and stays open while the mouse is over the
// block OR the popover (a short close delay bridges the gap), so resolved nodes can be clicked.
// Portals to <body> so the drawer's overflow never clips it.
function HopPopover({ hop, onViewNode, children }: {
  hop: ResolvedHop | undefined;
  onViewNode?: (nodeId: string) => void;
  children: ReactNode;
}) {
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
    <span ref={ref} onMouseEnter={open} onMouseLeave={scheduleClose} className="inline-flex">
      {children}
      {anchor &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            style={{ left: pos.left, top: pos.top }}
            onMouseEnter={clickable ? open : undefined}
            onMouseLeave={clickable ? scheduleClose : undefined}
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
          </span>,
          document.body,
        )}
    </span>
  );
}

// One path-hash block: tinted by its hop's resolution confidence and wrapped in the resolved-node
// popover. A single resolved node makes the block itself clickable (opens that node directly);
// ambiguous candidates are clickable in the popover; "none" just shows the tinted hash. Shared by
// PathData and the trace payload so both resolve hops identically.
export function ResolvedHopBlock({ hop, label, onViewNode }: {
  hop: ResolvedHop | undefined;
  label: string;
  onViewNode?: (nodeId: string) => void;
}) {
  const confidence: PathConfidence = hop?.confidence ?? "none";
  const blockClass = `px-1.5 py-px rounded-sm font-semibold ${HOP_BLOCK_CLASSES[confidence]}`;
  const single = hop && hop.nodes.length === 1 && onViewNode ? hop.nodes[0] : undefined;
  return (
    <HopPopover hop={hop} onViewNode={onViewNode}>
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

// Raw path-hash blocks, each tinted by its hop's resolution confidence and showing the resolved
// node(s) on hover. resolvedPath[i] lines up with the i-th hash (the backend appends one hop per
// hash in order), so a missing/short entry falls back to "none". When onViewNode is provided, a
// single-match block opens that node directly and ambiguous candidates are clickable in the popover.
export function PathData({ pathBytes, hashSize, resolvedPath, size = "md", onViewNode }: {
  pathBytes: string;
  hashSize: number;
  resolvedPath: ResolvedHop[];
  size?: "sm" | "md";
  onViewNode?: (nodeId: string) => void;
}) {
  const chars = hashSize * 2;
  // A 0-byte hash size would make the splitter `.{1,0}`, which the RegExp constructor rejects.
  // There's nothing to lay out without a hash size anyway, so bail.
  if (chars <= 0) return null;
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
