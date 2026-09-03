import { useCallback, useMemo } from "react";
import type { PacketSummary } from "../../types/api";
import { formatPropagation } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import { usePacketDetail } from "./usePacketDetail";
import { ObservationTable } from "./ObservationTable";
import { ObservationCard } from "./ObservationCard";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { PayloadType } from "../../types/enums";
import { buildPacketPaths } from "../map/packet-path";

// Roughly what fits the scroll cap; observations are unbounded server-side.
const SKELETON_ROW_CAP = 12;

// full-width and taller below md for a real tap target; desktop keeps its inline density
const ACTION_BUTTON_CLASS =
  "border border-border rounded-sm w-full md:w-auto px-3 py-2 md:px-2 md:py-0.5 text-[11px] md:text-[10px] bg-bg-raised text-text-normal hover:bg-text-normal/3 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors";

interface Props {
  packet: PacketSummary;
  onOpenAnalyzer: () => void;
  onViewPath: () => void;
  selectedObservationId: number | null;
  onSelectObservation: (id: number) => void;
}

// Expanded region under a packet row: a summary-driven timing strip (instant, no fetch wait) plus
// the per-observer table, which does wait on usePacketDetail.
export function PacketExpansion({ packet, onOpenAnalyzer, onViewPath, selectedObservationId, onSelectObservation }: Props) {
  const { data, isLoading, isError, refetch } = usePacketDetail(packet.packetHash);
  const isMobile = useIsMobile();
  const observer = packet.latestObserver;
  // firstHeardAt/lastHeardAt are epoch ms (same unit Timestamp expects), so the difference is
  // already in ms for formatPropagation -- no *1000 here.
  const spread = packet.lastHeardAt - packet.firstHeardAt;
  const ready = !isLoading && !isError;
  const hasPath = useMemo(() => (data ? buildPacketPaths(data).length > 0 : false), [data]);
  // The summary already knows the count is zero, so skip the fetch-driven states entirely rather
  // than showing a blank (0-row) skeleton while it loads.
  const noObservations = packet.observationCount === 0;
  const emptyState = <div className="text-[10px] text-text-dim py-2">No observations</div>;
  // Picking an observation is the way into the analyzer — it opens on the one you clicked.
  const handleSelectObservation = useCallback(
    (id: number) => {
      onSelectObservation(id);
      onOpenAnalyzer();
    },
    [onSelectObservation, onOpenAnalyzer],
  );

  // below md the expansion is the bottom half of the tapped card (the row's own border-b is the
  // divider); at md+ it stays the flat left-accented strip.
  return (
    <div data-testid="packet-expansion" className="bg-bg-surface border border-t-0 border-primary rounded-b-md px-3.5 py-2 md:border-0 md:border-l-2 md:rounded-none md:pl-6 md:pr-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] md:text-[10px] text-text-muted pb-2">
        {/* the mobile card header right above already names the latest observer */}
        <span className="hidden md:inline">
          observer{" "}
          {observer
            ? <span className="text-text-normal">{observer.displayName ?? observer.id.slice(0, 8)}</span>
            : <span className="text-text-dim">n/a</span>}
        </span>
        <span>first <Timestamp value={packet.firstHeardAt} /></span>
        <span>last <Timestamp value={packet.lastHeardAt} /></span>
        <span>spread {formatPropagation(spread)}</span>
        <button
          type="button"
          onClick={onViewPath}
          disabled={!ready || !hasPath}
          title={hasPath ? undefined : "No resolved path to map"}
          className={ACTION_BUTTON_CLASS}
        >
          View path on map
        </button>
      </div>

      {/* capped scroller is desktop-only; on touch it would trap the page scroll */}
      <div data-testid="observation-scroller" className="md:max-h-[360px] md:overflow-y-auto">
        {isError ? (
          <div className="flex flex-wrap items-center gap-3 text-[11px] md:text-[10px] text-danger py-2">
            <span>Failed to load observations</span>
            <button type="button" onClick={() => refetch()} className={ACTION_BUTTON_CLASS}>
              Retry
            </button>
          </div>
        ) : noObservations ? (
          emptyState
        ) : isLoading ? (
          <div>
            {Array.from({ length: Math.min(packet.observationCount, SKELETON_ROW_CAP) }).map((_, i) => (
              <div
                key={i}
                data-testid="observation-skeleton"
                className="h-[22px] border-t border-border-subtle animate-pulse bg-bg-raised/30"
              />
            ))}
          </div>
        ) : data && data.observations.length === 0 ? (
          emptyState
        ) : data ? (
          // The table's eight columns need ~407px, so below md its Path column lands off-screen
          // behind a nested sideways scroll. Cards give the path a full-width row of its own.
          isMobile ? (
            <div className="flex flex-col gap-1.5">
              {data.observations.map((o) => (
                <ObservationCard
                  key={o.id}
                  observation={o}
                  selected={o.id === selectedObservationId}
                  onClick={() => handleSelectObservation(o.id)}
                  isTrace={data.header.payloadType === PayloadType.TRACE}
                />
              ))}
            </div>
          ) : (
            <ObservationTable observations={data.observations} selectedId={selectedObservationId} onSelect={handleSelectObservation} />
          )
        ) : null}
      </div>
    </div>
  );
}
