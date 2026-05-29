import { formatHex, formatTimestamp } from "../../lib/formatters";
import type { PacketSummary, PacketDetail } from "../../types/api";
import { Badge } from "../../components/Badge";
import { payloadTypeVariant } from "../../components/badge-utils";
import { ObservationCard } from "./ObservationCard";

interface PacketRowProps {
  packet: PacketSummary;
  expanded: boolean;
  detail?: PacketDetail;
  isFresh?: boolean;
  onToggle: () => void;
  selectedObservationId?: number | null;
  onSelectObservation?: (id: number) => void;
}

// expandable packet card with observations

export function PacketRow({ packet, expanded, detail, isFresh, onToggle, selectedObservationId, onSelectObservation }: PacketRowProps) {
  return (
    <div
      className={`group bg-bg-surface border rounded-md px-3.5 py-2.5 cursor-pointer ${
        expanded
          ? "border-secondary bg-bg-raised"
          : isFresh
            ? "packet-fresh"
            : "border-border hover:border-text-dim/30 hover:bg-bg-raised/50"
      }`}
      onClick={() => onToggle()}
      aria-expanded={expanded}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-text-muted group-hover:text-text-normal text-[11px] w-3.5 font-mono transition-colors" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
        <span className="font-mono text-xs font-semibold text-primary tracking-wider">
          {formatHex(packet.packetHash)}
        </span>
        <Badge variant={payloadTypeVariant(packet.payloadType)}>{packet.payloadTypeName}</Badge>
        {packet.summary && (
          <span className="flex-1 text-text-bright text-xs whitespace-nowrap overflow-hidden text-ellipsis">
            {packet.summary}
          </span>
        )}
        <span className="font-mono text-[11px] text-primary font-semibold whitespace-nowrap bg-primary/6 px-1.5 rounded-sm">
          ×{packet.observationCount}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-1 pl-6 text-[11px] text-text-dim">
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-wider bg-text-muted/8 px-1.5 py-px rounded-sm">
          {packet.routeTypeName || "Unknown"}
        </span>
        <span className="text-[6px] text-border" aria-hidden>·</span>
        <span>{formatTimestamp(packet.lastHeardAt)}</span>
        {packet.latestObserver && (
          <>
            <span className="text-[6px] text-border" aria-hidden>·</span>
            <span className="text-text-normal">{packet.latestObserver.displayName ?? packet.latestObserver.id.slice(0, 8)}</span>
            <span className="text-[6px] text-border" aria-hidden>·</span>
            <span className="font-mono font-bold text-primary text-[11px] tracking-wider">
              {packet.latestObserver.iata}
            </span>
          </>
        )}
      </div>

      {expanded && detail && (
        <div className="mt-2 pl-6 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          {detail.observations.map((obs) => (
            <ObservationCard
              key={obs.id}
              observation={obs}
              selected={selectedObservationId === obs.id}
              onClick={onSelectObservation ? () => onSelectObservation(obs.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
