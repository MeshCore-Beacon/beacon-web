import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTraces } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { SkeletonRows } from "../../components/SkeletonRows";
import { EmptyState } from "../../components/EmptyState";
import { Timestamp } from "../../components/Timestamp";
import { TraceDetailPanel } from "./TraceDetailPanel";
import type { TraceTagSummary } from "../../types/api";

// Traces are modest in number and the list isn't streamed, so a single region-filtered fetch covers
// the card list (the /traces cursor is sound if pagination is ever needed).
const TRACE_LIST_LIMIT = 200;

interface TraceListProps {
  onAnalyze: (hash: string | null) => void;
}

// A trace tag as a selectable card, echoing PacketRow's look so the tab reads like the Packets tab.
function TraceTagCard({ tag, selected, onSelect }: {
  tag: TraceTagSummary;
  selected: boolean;
  onSelect: (tag: string) => void;
}) {
  return (
    <div
      className={`bg-bg-surface border rounded-md px-3.5 py-2.5 cursor-pointer ${
        selected ? "border-primary bg-primary/10" : "border-border hover:border-text-dim/30 hover:bg-bg-raised/50"
      }`}
      onClick={() => onSelect(tag.traceTag)}
      aria-pressed={selected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(tag.traceTag);
        }
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs font-semibold text-primary tracking-wider">{tag.traceTag.toUpperCase()}</span>
        <Timestamp value={tag.lastHeardAt} className="ml-auto text-[11px] text-text-dim" />
      </div>
      <div className="mt-1 text-[11px] text-text-dim font-mono">
        {tag.packetCount} pkt · {tag.iataCount} iata
      </div>
    </div>
  );
}

export function TraceList({ onAnalyze }: TraceListProps) {
  const { iatas, regionKey } = useRegion();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // drop the selection when the region changes — the selected tag may not be in the new region
  const prevRegion = useRef(regionKey);
  useEffect(() => {
    if (prevRegion.current !== regionKey) {
      prevRegion.current = regionKey;
      setSelectedTag(null);
    }
  }, [regionKey]);

  const { data: tags, isLoading } = useQuery({
    queryKey: ["traces", regionKey],
    queryFn: () => getTraces(iatas, { limit: TRACE_LIST_LIMIT }),
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 min-w-0 overflow-y-auto p-3 flex flex-col gap-2">
        {isLoading ? (
          <SkeletonRows rows={8} />
        ) : (tags?.length ?? 0) === 0 ? (
          <EmptyState title="No traces" />
        ) : (
          tags!.map((t) => (
            <TraceTagCard key={t.traceTag} tag={t} selected={t.traceTag === selectedTag} onSelect={setSelectedTag} />
          ))
        )}
      </div>
      {selectedTag && (
        <TraceDetailPanel tag={selectedTag} onClose={() => setSelectedTag(null)} onAnalyze={onAnalyze} />
      )}
    </div>
  );
}
