import { useRef, useCallback, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PacketSummary } from "../../types/api";
import { PacketTableHeader } from "./PacketTableHeader";
import { PacketTableRow } from "./PacketTableRow";
import { PacketRow } from "./PacketRow";
import { PacketExpansion } from "./PacketExpansion";
import { useFreshHashes } from "./useFreshHashes";
import { useIsMobile } from "../../hooks/useMediaQuery";
import {
  SCROLL_TOP_THRESHOLD_PX,
  SCROLL_BOTTOM_THRESHOLD_PX,
  SCROLL_REVEAL_EPSILON_PX,
} from "../../lib/constants";

interface PacketVirtualListProps {
  packets: PacketSummary[];
  hasNextPage: boolean;
  isFetching: boolean;
  fetchNextPage: () => void;
  onScrollAwayFromTop: (isAway: boolean) => void;
  onAtTopChange: (isAtTop: boolean) => void;
  expandedHash: string | null;
  onToggleExpand: (hash: string) => void;
  // only the expanded row renders an expansion, so these need no hash argument
  onOpenAnalyzer: () => void;
  onViewPath: () => void;
  selectedObservationId: number | null;
  onSelectObservation: (id: number) => void;
}

// virtualized scroll list with fresh-item highlighting and infinite load

export function PacketVirtualList({
  packets,
  hasNextPage,
  isFetching,
  fetchNextPage,
  onScrollAwayFromTop,
  onAtTopChange,
  expandedHash,
  onToggleExpand,
  onOpenAnalyzer,
  onViewPath,
  selectedObservationId,
  onSelectObservation,
}: PacketVirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const freshHashes = useFreshHashes(packets);
  const isMobile = useIsMobile();
  const atTopRef = useRef(true);
  const prevFirstKeyRef = useRef<string | undefined>(packets[0]?.packetHash);

  const virtualizer = useVirtualizer({
    count: packets.length,
    getScrollElement: () => parentRef.current,
    // a collapsed row: one grid line on desktop, a taller card below md. Expanded rows are remeasured.
    estimateSize: () => (isMobile ? 64 : 37),
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

    if (hasNextPage && !isFetching) {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom < SCROLL_BOTTOM_THRESHOLD_PX) {
        fetchNextPage();
      }
    }
  }, [hasNextPage, isFetching, fetchNextPage, onScrollAwayFromTop, onAtTopChange]);

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
      <PacketTableHeader />
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const packet = packets[virtualRow.index];
          if (!packet) return null;
          const expanded = expandedHash === packet.packetHash;
          return (
            <div
              key={packet.packetHash}
              data-index={virtualRow.index}
              data-testid={`packet-item-${packet.packetHash}`}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {/* cards need breathing room; table rows butt up so the whole strip is a click target */}
              <div className={isMobile ? "pt-1.5" : ""}>
                {isMobile ? (
                  <PacketRow
                    packet={packet}
                    expanded={expanded}
                    isFresh={freshHashes.has(packet.packetHash)}
                    onToggle={() => onToggleExpand(packet.packetHash)}
                  />
                ) : (
                  <PacketTableRow
                    packet={packet}
                    expanded={expanded}
                    isFresh={freshHashes.has(packet.packetHash)}
                    onToggle={() => onToggleExpand(packet.packetHash)}
                  />
                )}
                {expanded && (
                  <PacketExpansion
                    packet={packet}
                    onOpenAnalyzer={onOpenAnalyzer}
                    onViewPath={onViewPath}
                    selectedObservationId={selectedObservationId}
                    onSelectObservation={onSelectObservation}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {packets.length === 0 && (
        <p className="py-4 text-center text-xs font-mono text-text-muted">No matching packets loaded.</p>
      )}
      {hasNextPage && (
        <div className="flex justify-center py-4">
          <button
            type="button"
            disabled={isFetching}
            onClick={() => fetchNextPage()}
            className="rounded border border-border px-3 py-1.5 text-xs font-mono text-text-normal hover:bg-text-normal/3 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isFetching ? "Loading packets..." : "Load older packets"}
          </button>
        </div>
      )}
    </div>
  );
}
