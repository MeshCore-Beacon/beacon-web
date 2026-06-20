import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTraces } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { SkeletonRows } from "../../components/SkeletonRows";
import { EmptyState } from "../../components/EmptyState";
import { Timestamp } from "../../components/Timestamp";
import { Badge } from "../../components/Badge";
import { Segmented } from "../stats/Segmented";
import { snrLevel, SIGNAL_LEVEL_CLASSES, formatSnr } from "../../lib/formatters";
import { TraceDetailPanel } from "./TraceDetailPanel";
import type { TraceTagSummary, TraceType } from "../../types/api";

// Traces are modest in number and the list isn't streamed, so a single region-filtered fetch covers
// the card list (the /traces cursor is sound if pagination is ever needed).
const TRACE_LIST_LIMIT = 200;

// "" = both; the backend takes TRACE or PING and omits the param to mean all.
const TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "TRACE", label: "Trace" },
  { value: "PING", label: "Ping" },
];

interface TraceListProps {
  onAnalyze: (hash: string | null) => void;
  onViewNode?: (nodeId: string) => void;
}

// The list now carries the most complete observation's path, so we can show the hops (and the SNR we
// heard on each) right on the card instead of making people open the detail panel for a quick look.
function TracePathPreview({ hashes, snrs }: { hashes: string[]; snrs: number[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {hashes.map((hash, i) => {
        const snr = snrs?.[i];
        const level = snr != null ? snrLevel(snr) : null;
        const sigClass = level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal";
        return (
          <span key={i} className="contents">
            {i > 0 && <span className="text-text-dim" aria-hidden>→</span>}
            <span className="inline-flex flex-col items-center gap-0.5">
              <span className="px-1.5 py-px rounded-sm bg-primary/6 text-primary font-mono text-[11px] font-semibold">
                {hash.toUpperCase()}
              </span>
              {/* keep a sub-line on every hop (SNR or a placeholder) so the badges across the row line up */}
              {snr != null ? (
                <span className={`font-mono text-[10px] ${sigClass}`}>{formatSnr(snr)} dB</span>
              ) : (
                <span className="font-mono text-[10px] text-text-dim" aria-hidden>-</span>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
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
        {/* pings get the primary tint, traces the amber one, so the two read apart at a glance */}
        {tag.traceType && <Badge variant={tag.traceType === "PING" ? "text" : "trace"}>{tag.traceType}</Badge>}
        <Timestamp value={tag.lastHeardAt} className="ml-auto text-[11px] text-text-dim" />
      </div>
      <div className="mt-1 text-[11px] text-text-dim font-mono">
        {tag.packetCount} pkt · {tag.iataCount} iata
      </div>
      {tag.pathHashes?.length ? <TracePathPreview hashes={tag.pathHashes} snrs={tag.snrValues ?? []} /> : null}
    </div>
  );
}

export function TraceList({ onAnalyze, onViewNode }: TraceListProps) {
  const { iatas, regionKey } = useRegion();
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"" | TraceType>("");

  // drop the selection when the region changes — the selected tag may not be in the new region
  const prevRegion = useRef(regionKey);
  useEffect(() => {
    if (prevRegion.current !== regionKey) {
      prevRegion.current = regionKey;
      setSelectedTag(null);
    }
  }, [regionKey]);

  const { data: tags, isLoading } = useQuery({
    queryKey: ["traces", regionKey, typeFilter],
    queryFn: () => getTraces(iatas, { limit: TRACE_LIST_LIMIT, type: typeFilter || undefined }),
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="font-mono text-[11px] text-text-dim">
            {tags ? `${tags.length} tag${tags.length === 1 ? "" : "s"}` : ""}
          </span>
          <Segmented
            options={TYPE_OPTIONS}
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as "" | TraceType)}
            ariaLabel="Trace type"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
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
      </div>
      {selectedTag && (
        <TraceDetailPanel tag={selectedTag} onClose={() => setSelectedTag(null)} onAnalyze={onAnalyze} onViewNode={onViewNode} />
      )}
    </div>
  );
}
