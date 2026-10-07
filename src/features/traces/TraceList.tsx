import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getTraces } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { SkeletonRows } from "../../components/SkeletonRows";
import { EmptyState } from "../../components/EmptyState";
import { Timestamp } from "../../components/Timestamp";
import { Badge } from "../../components/Badge";
import { InfoTip } from "../../components/InfoTip";
import { Segmented } from "../stats/Segmented";
import { snrLevel, SIGNAL_LEVEL_CLASSES, formatSnr } from "../../lib/formatters";
import { TraceDetailPanel } from "./TraceDetailPanel";
import type { TraceTagSummary, TraceType } from "../../types/api";

import { TraceQualityNotice } from "./TraceQualityNotice";
import { isQuestionable } from "./trace-quality";

// A bounded sample; the hidden count refers only to these loaded tags.
const TRACE_LIST_LIMIT = 200;
const TRACE_PATH_PREVIEW_LIMIT = 6;

interface TraceListProps {
  onAnalyze: (hash: string | null) => void;
  onViewNode?: (nodeId: string) => void;
}

// The list now carries the most complete observation's path, so we can show the hops (and the SNR we
// heard on each) right on the card instead of making people open the detail panel for a quick look.
function TracePathPreview({ hashes, snrs, expanded }: { hashes: string[]; snrs: number[]; expanded: boolean }) {
  const shownHashes = expanded ? hashes : hashes.slice(0, TRACE_PATH_PREVIEW_LIMIT);
  const hiddenCount = hashes.length - shownHashes.length;
  return (
    <div className="mt-1 flex min-w-0 max-w-full flex-wrap items-center gap-1">
      {shownHashes.map((hash, i) => {
        const snr = snrs?.[i];
        const level = snr != null ? snrLevel(snr) : null;
        const sigClass = level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal";
        return (
          <span key={i} className="inline-flex shrink-0 items-center gap-1">
            {i > 0 && <span className="text-text-dim" aria-hidden>→</span>}
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/6 px-1">
              <span className="text-primary font-mono text-[10px] font-semibold">
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
      {hiddenCount > 0 && (
        <span className="font-mono text-[10px] text-text-dim">… +{hiddenCount}</span>
      )}
    </div>
  );
}

// A trace tag as a selectable card, echoing PacketRow's look so the tab reads like the Packets tab.
function TraceTagCard({ tag, selected, onSelect }: {
  tag: TraceTagSummary;
  selected: boolean;
  onSelect: (tag: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="button"
      className={`shrink-0 min-h-11 min-w-0 max-w-full bg-bg-surface border-b px-3 py-1.5 cursor-pointer ${
        selected ? "border-primary bg-primary/10" : "border-border hover:border-text-dim/30 hover:bg-bg-raised/50"
      }`}
      onClick={() => onSelect(selected ? null : tag.traceTag)}
      aria-pressed={selected}
      aria-expanded={selected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(selected ? null : tag.traceTag);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="shrink-0 w-3.5 text-text-muted text-[11px]" aria-hidden>
          {selected ? "▾" : "▸"}
        </span>
        <span className="font-mono text-xs font-semibold text-primary tracking-wider">{tag.traceTag.toUpperCase()}</span>
        {/* pings get the primary tint, traces the amber one, so the two read apart at a glance */}
        {tag.traceType && <Badge variant={tag.traceType === "PING" ? "text" : "trace"}>{tag.traceType}</Badge>}
        <span className="font-mono text-[10px] text-text-dim">{t("traces.pkt", { count: tag.packetCount })} · {t("traces.iata", { count: tag.iataCount })} · {t("traces.hops", { count: tag.pathHashes?.length ?? 0 })}</span>

        <TraceQualityNotice quality={tag.quality} compact />
        <Timestamp value={tag.lastHeardAt} className="ml-auto text-[11px] text-text-dim" />
      </div>
      {tag.pathHashes?.length ? <TracePathPreview hashes={tag.pathHashes} snrs={tag.snrValues ?? []} expanded={selected} /> : null}
    </div>
  );
}

export function TraceList({ onAnalyze, onViewNode }: TraceListProps) {
  const { t } = useTranslation();
  const { iatas, regionKey, isResolved } = useRegion();
  // "" = both; the backend takes TRACE or PING and omits the param to mean all.
  const typeOptions = useMemo(() => [
    { value: "", label: t("traces.all") },
    { value: "TRACE", label: t("traces.trace") },
    { value: "PING", label: t("traces.ping") },
  ], [t]);

  const [showQuestionable, setShowQuestionable] = useState(false);
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
    enabled: isResolved !== false,
  });

  const questionableCount = tags?.filter((tag) => isQuestionable(tag.quality)).length ?? 0;
  const visibleTags = tags?.filter((tag) => showQuestionable || !isQuestionable(tag.quality));
  const selectedVisible = visibleTags?.some((tag) => tag.traceTag === selectedTag);

  return (
    <div className="flex flex-1 min-h-0 min-w-0 max-w-full">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex flex-wrap shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="font-mono text-[11px] text-text-dim">
            {tags ? t("traces.tagCount", { count: visibleTags?.length ?? 0 }) : ""}
            {questionableCount > 0 && !showQuestionable && <> · {t("traces.quality.hidden", { count: questionableCount })}</>}
          </span>
          <label className="flex items-center gap-1.5 text-[11px] text-text-muted cursor-pointer">
            <input type="checkbox" checked={showQuestionable} onChange={(e) => { setShowQuestionable(e.target.checked); setSelectedTag(null); }} />
            {t("traces.quality.show")}
          </label>
          <div className="flex items-center gap-2">
            <InfoTip text={t("traces.typeHint")} />
            <Segmented
              options={typeOptions}
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as "" | TraceType)}
              ariaLabel={t("traces.typeLabel")}
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 min-w-0 overflow-y-auto flex flex-col">
          {isLoading || isResolved === false ? (
            <SkeletonRows rows={8} />
          ) : (visibleTags?.length ?? 0) === 0 ? (
            <EmptyState title={t("traces.empty")} />
          ) : (
            visibleTags!.map((tag) => (
              <TraceTagCard key={tag.traceTag} tag={tag} selected={tag.traceTag === selectedTag} onSelect={setSelectedTag} />
            ))
          )}
        </div>
      </div>
      {selectedTag && selectedVisible && (
        <TraceDetailPanel tag={selectedTag} onClose={() => setSelectedTag(null)} onAnalyze={onAnalyze} onViewNode={onViewNode} />
      )}
    </div>
  );
}
