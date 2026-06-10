import { useQuery } from "@tanstack/react-query";
import { getTraceDetail } from "../../api/client";
import { DetailPanel, Section, Field } from "../../components/DetailPanel";
import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { ResolvedHopBlock } from "../packets/PathData";
import { ScopeTag } from "../../components/ScopeTag";
import { formatSnr, snrLevel, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import type { RawHop, ResolvedHop, TracePacket } from "../../types/api";

// A trace packet's path, rendered exactly like the TRACE payload view: the raw path-hash byte as the
// label, tinted by resolution confidence with candidate nodes in the popover, and the per-hop SNR on a
// sub-line below it (a "-" placeholder keeps the row aligned). rawPath and resolvedRoute are
// index-aligned (one entry per hash).
function TraceHopChain({ rawPath, resolvedRoute, onViewNode }: {
  rawPath: RawHop[];
  resolvedRoute: ResolvedHop[];
  onViewNode?: (nodeId: string) => void;
}) {
  if (rawPath.length === 0) return <span className="text-text-dim text-[11px] font-mono">no path</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 font-mono text-[13px]">
      {rawPath.map((raw, i) => {
        const snr = raw.snr;
        const level = snr != null ? snrLevel(snr) : null;
        const sigClass = level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal";
        return (
          <span key={i} className="contents">
            {i > 0 && <span className="text-text-dim" aria-hidden>→</span>}
            <span className="inline-flex flex-col items-center gap-0.5">
              <ResolvedHopBlock hop={resolvedRoute[i]} label={raw.hash.toUpperCase()} onViewNode={onViewNode} showSnr={false} />
              {snr != null ? (
                <span className={`text-[11px] ${sigClass}`}>{formatSnr(snr)} dB</span>
              ) : (
                <span className="text-[11px] text-text-dim" aria-hidden>-</span>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// One packet in the selected trace. Clicking it opens the shared packet analyzer (the same overlay the
// other tabs use), so a trace packet drills into observations exactly like any packet elsewhere.
function TracePacketRow({ pkt, onAnalyze, onViewNode }: {
  pkt: TracePacket;
  onAnalyze: (hash: string) => void;
  onViewNode?: (nodeId: string) => void;
}) {
  // A div, not a button: the hop popover nests clickable node buttons, so the row can't itself be a
  // button. Mirrors TraceTagCard's role/tabIndex/onKeyDown; hop clicks stopPropagation so they don't analyze.
  return (
    <div
      role="button"
      tabIndex={0}
      className="rounded-md border border-border bg-bg-base px-3 py-2 cursor-pointer hover:border-text-dim/30 hover:bg-bg-raised/50 transition-colors"
      onClick={() => onAnalyze(pkt.packetHash)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAnalyze(pkt.packetHash);
        }
      }}
    >
      <div className="flex items-center gap-2 text-[11px] text-text-dim">
        <Badge variant="default">{pkt.routeTypeName || "Unknown"}</Badge>
        {pkt.scope && <ScopeTag>{pkt.scope}</ScopeTag>}
        <span className="ml-auto font-mono text-text-dim">analyze →</span>
      </div>
      <div className="mt-1.5 flex flex-col gap-0.5 font-mono text-[11px]">
        <Field label="First" value={<Timestamp value={pkt.firstHeardAt} ms />} />
        <Field label="Last" value={<Timestamp value={pkt.lastHeardAt} ms />} />
      </div>
      <div className="mt-1.5">
        <TraceHopChain rawPath={pkt.rawPath} resolvedRoute={pkt.resolvedRoute} onViewNode={onViewNode} />
      </div>
    </div>
  );
}

interface TraceDetailPanelProps {
  tag: string;
  onClose: () => void;
  onAnalyze: (hash: string) => void;
  onViewNode?: (nodeId: string) => void;
}

// Right-hand detail panel for a selected trace tag, matching the other entity tabs. The trace's
// packets stand in for the packet analyzer's "Observations": a "Packets" section listing each packet,
// any of which opens the packet analyzer.
export function TraceDetailPanel({ tag, onClose, onAnalyze, onViewNode }: TraceDetailPanelProps) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["trace", tag],
    queryFn: () => getTraceDetail(tag),
    staleTime: 30_000,
  });

  // most-recently-heard packet first (the backend order isn't guaranteed)
  const packets = detail ? [...detail.packets].sort((a, b) => b.lastHeardAt - a.lastHeardAt) : [];

  return (
    <DetailPanel title={tag.toUpperCase()} onClose={onClose} isLoading={isLoading}>
      <Section title="Packets" first>
        {packets.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="text-text-dim text-[11px] font-mono">
              {packets.length} packet{packets.length === 1 ? "" : "s"}
            </span>
            {packets.map((pkt) => (
              <TracePacketRow key={pkt.packetHash} pkt={pkt} onAnalyze={onAnalyze} onViewNode={onViewNode} />
            ))}
          </div>
        ) : (
          <span className="text-text-dim text-[11px] font-mono">No packets</span>
        )}
      </Section>
    </DetailPanel>
  );
}
