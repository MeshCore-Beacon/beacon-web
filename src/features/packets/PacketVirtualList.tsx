import { useRef, useCallback, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PacketSummary } from "../../types/api";
import { PacketRow } from "./PacketRow";
import { useFreshHashes } from "./useFreshHashes";
import {
  SCROLL_TOP_THRESHOLD_PX,
  SCROLL_BOTTOM_THRESHOLD_PX,
  SCROLL_REVEAL_EPSILON_PX,
} from "../../lib/constants";

interface PacketVirtualListProps {
  packets: PacketSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onScrollAwayFromTop: (isAway: boolean) => void;
  onAtTopChange: (isAtTop: boolean) => void;
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
  onAtTopChange,
  expandedHash,
  onToggleExpand,
}: PacketVirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const freshHashes = useFreshHashes(packets);
  const atTopRef = useRef(true);
  const prevFirstKeyRef = useRef<string | undefined>(packets[0]?.packetHash);

  const virtualizer = useVirtualizer({
    count: packets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // rough -- rows vary a lot when expanded, tanstack remeasures
    overscan: 10,
    getItemKey: (index) => packets[index]?.packetHash ?? index,
  });

  // The list is frozen at the data layer while scrolled away, so there's nothing to compensate
  // here — we only report scroll position: past the threshold shows the banner, and back at the
  // very top releases the freeze (revealing held packets where a prepend is jump-free).
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    atTopRef.current = el.scrollTop <= SCROLL_REVEAL_EPSILON_PX;
    onScrollAwayFromTop(el.scrollTop > SCROLL_TOP_THRESHOLD_PX);
    onAtTopChange(atTopRef.current);

    if (hasNextPage && !isFetchingNextPage) {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom < SCROLL_BOTTOM_THRESHOLD_PX) {
        fetchNextPage();
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, onScrollAwayFromTop, onAtTopChange]);

  // When rows are prepended at the top (a reveal on return-to-top, or a live packet while already
  // at the top), TanStack keeps the previously-top row anchored — which drifts the view off the
  // newest packet. Re-pin index 0 so the newest stays at the top; only while at the top, so a
  // prepend never disturbs someone reading further down.
  useLayoutEffect(() => {
    const firstKey = packets[0]?.packetHash;
    const firstChanged = firstKey !== prevFirstKeyRef.current;
    prevFirstKeyRef.current = firstKey;
    if (firstChanged && atTopRef.current) {
      virtualizer.scrollToIndex(0, { align: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on packet-list change; virtualizer is stable
  }, [packets]);

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
