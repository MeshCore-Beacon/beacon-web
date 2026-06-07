import { useQuery } from "@tanstack/react-query";
import { getTraceDetail } from "../../api/client";
import { DetailPanel, Section, Field } from "../../components/DetailPanel";
import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { ResolvedHopBlock } from "../packets/PathData";
import { ScopeTag } from "../../components/ScopeTag";
import type { ResolvedHop, TracePacket } from "../../types/api";

// A trace packet's resolved route, reusing the packet path renderer's hop block. Resolved hops are
// labelled by node. The backend doesn't send per-hop hash bytes on trace routes yet (see hashBytes on
// ResolvedHop), so unresolved hops currently fall back to their #position in the path.
function TraceHopChain({ hops }: { hops: ResolvedHop[] }) {
  if (hops.length === 0) return <span className="text-text-dim text-[11px] font-mono">no path</span>;
  return (
    <div className="flex flex-wrap items-center gap-1 font-mono text-[13px]">
      {hops.map((hop, i) => {
        const node = hop.nodes[0];
        const label = node
          ? (node.name ?? node.publicKey.slice(0, 8))
          : hop.hashBytes
            ? hop.hashBytes.toUpperCase()
            : `#${i + 1}`;
        return (
          <span key={i} className="contents">
            {i > 0 && <span className="text-text-dim" aria-hidden>→</span>}
            <ResolvedHopBlock hop={hop} label={label} />
          </span>
        );
      })}
    </div>
  );
}

// One packet in the selected trace. Clicking it opens the shared packet analyzer (the same overlay the
// other tabs use), so a trace packet drills into observations exactly like any packet elsewhere.
function TracePacketRow({ pkt, onAnalyze }: { pkt: TracePacket; onAnalyze: (hash: string) => void }) {
  return (
    <button
      type="button"
      className="w-full text-left rounded-md border border-border bg-bg-base px-3 py-2 cursor-pointer hover:border-text-dim/30 hover:bg-bg-raised/50 transition-colors"
      onClick={() => onAnalyze(pkt.packetHash)}
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
        <TraceHopChain hops={pkt.resolvedRoute} />
      </div>
    </button>
  );
}

interface TraceDetailPanelProps {
  tag: string;
  onClose: () => void;
  onAnalyze: (hash: string) => void;
}

// Right-hand detail panel for a selected trace tag, matching the other entity tabs. The trace's
// packets stand in for the packet analyzer's "Observations": a "Packets" section listing each packet,
// any of which opens the packet analyzer.
export function TraceDetailPanel({ tag, onClose, onAnalyze }: TraceDetailPanelProps) {
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
              <TracePacketRow key={pkt.packetHash} pkt={pkt} onAnalyze={onAnalyze} />
            ))}
          </div>
        ) : (
          <span className="text-text-dim text-[11px] font-mono">No packets</span>
        )}
      </Section>
    </DetailPanel>
  );
}
