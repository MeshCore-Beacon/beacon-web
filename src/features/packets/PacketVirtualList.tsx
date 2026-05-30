import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PacketSummary } from "../../types/api";
import { PacketRow } from "./PacketRow";
import { LIVE_BUFFER_CAP, SCROLL_TOP_THRESHOLD_PX, SCROLL_BOTTOM_THRESHOLD_PX } from "../../lib/constants";

interface PacketVirtualListProps {
  packets: PacketSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onScrollAwayFromTop: (isAway: boolean) => void;
  scrollToTopRef?: React.MutableRefObject<(() => void) | null>;
  expandedHash: string | null;
  onToggleExpand: (hash: string) => void;
}

// virtualized scroll list with fresh-item highlighting and infinite load

export function PacketVirtualList({
  packets,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onScrollAwayFromTop,
  scrollToTopRef,
  expandedHash,
  onToggleExpand,
}: PacketVirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const knownHashes = useRef<Set<string>>(new Set());
  const [freshHashes, setFreshHashes] = useState<Set<string>>(new Set());
  const freshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAtTopRef = useRef(true);
  const prevCountRef = useRef(packets.length);
  const prevFirstKeyRef = useRef<string | undefined>(packets[0]?.packetHash);
  const savedScrollHeightRef = useRef(0);
  const shouldCompensateRef = useRef(false);

  // Anchor scroll position when live packets are PREPENDED while the user is scrolled away from
  // the top. The pre-commit scroll height must be read here in the render body (parentRef still
  // points at the old DOM); a post-commit effect is too late — the virtualizer's spacer has
  // already grown, collapsing the delta to ~0 so nothing offsets the new rows. A changed first
  // key distinguishes a real top-prepend from history pages appended at the bottom by
  // fetchNextPage (those grow the count too but must NOT shift the view).
  if (
    packets.length > prevCountRef.current &&
    packets[0]?.packetHash !== prevFirstKeyRef.current &&
    !isAtTopRef.current &&
    parentRef.current
  ) {
    savedScrollHeightRef.current = parentRef.current.scrollHeight;
    shouldCompensateRef.current = true;
  }

  const virtualizer = useVirtualizer({
    count: packets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // rough -- rows vary a lot when expanded, tanstack remeasures
    overscan: 10,
    getItemKey: (index) => packets[index]?.packetHash ?? index,
  });

  const hadDataRef = useRef(false);

  useEffect(() => {
    if (!hadDataRef.current) {
      if (packets.length === 0) return;
      hadDataRef.current = true;
      for (const p of packets) {
        knownHashes.current.add(p.packetHash);
      }
      return;
    }

    const newFresh: string[] = [];
    for (const p of packets) {
      if (knownHashes.current.has(p.packetHash)) break;
      newFresh.push(p.packetHash);
    }

    for (const p of packets) {
      knownHashes.current.add(p.packetHash);
    }

    if (knownHashes.current.size > LIVE_BUFFER_CAP * 2) {
      const keep = new Set(packets.map((p) => p.packetHash));
      knownHashes.current = keep;
    }

    if (newFresh.length > 0) {
      setFreshHashes((prev) => {
        const next = new Set(prev);
        for (const h of newFresh) next.add(h);
        return next;
      });
      if (freshTimerRef.current) clearTimeout(freshTimerRef.current);
      freshTimerRef.current = setTimeout(() => {
        freshTimerRef.current = null;
        setFreshHashes((prev) => {
          const next = new Set(prev);
          for (const h of newFresh) next.delete(h);
          return next;
        });
      }, 1000);
    }

    return () => {
      if (freshTimerRef.current) {
        clearTimeout(freshTimerRef.current);
        freshTimerRef.current = null;
      }
    };
  }, [packets]);

  // After commit, before paint: offset scrollTop by the height the prepended rows added so the
  // view stays anchored on the same packet. Keyed on the array (not just length) so bookkeeping
  // stays current even when the live buffer is at its cap and the count holds steady.
  useLayoutEffect(() => {
    if (shouldCompensateRef.current) {
      shouldCompensateRef.current = false;
      const el = parentRef.current;
      if (el) {
        const delta = el.scrollHeight - savedScrollHeightRef.current;
        if (delta > 0) el.scrollTop += delta;
      }
    }
    prevCountRef.current = packets.length;
    prevFirstKeyRef.current = packets[0]?.packetHash;
  }, [packets]);

  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    isAtTopRef.current = el.scrollTop <= SCROLL_TOP_THRESHOLD_PX;
    onScrollAwayFromTop(!isAtTopRef.current);

    if (hasNextPage && !isFetchingNextPage) {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom < SCROLL_BOTTOM_THRESHOLD_PX) {
        fetchNextPage();
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, onScrollAwayFromTop]);

  useEffect(() => {
    if (!scrollToTopRef) return;
    scrollToTopRef.current = () => {
      const el = parentRef.current;
      if (el) {
        isAtTopRef.current = true;
        el.scrollTop = 0;
        onScrollAwayFromTop(false);
      }
    };
  }, [scrollToTopRef, onScrollAwayFromTop]);

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto px-4 pb-10"
      onScroll={handleScroll}
    >
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const packet = packets[virtualRow.index];
          if (!packet) return null;
          return (
            <div
              key={packet.packetHash}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="pt-1.5">
                <PacketRow
                  packet={packet}
                  expanded={expandedHash === packet.packetHash}
                  isFresh={freshHashes.has(packet.packetHash)}
                  onToggle={() => onToggleExpand(packet.packetHash)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
