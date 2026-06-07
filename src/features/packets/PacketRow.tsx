import { formatHex } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import type { PacketSummary } from "../../types/api";
import { Badge } from "../../components/Badge";
import { Tooltip } from "../../components/Tooltip";
import { payloadTypeVariant } from "../../components/badge-utils";
import { ScopeTag } from "../../components/ScopeTag";
import { PAYLOAD_TYPE_NAMES, type PayloadTypeValue } from "../../types/enums";

interface PacketRowProps {
  packet: PacketSummary;
  expanded: boolean;
  isFresh?: boolean;
  onToggle: () => void;
}

// selectable packet card; observations live in the analyzer drawer

export function PacketRow({ packet, expanded, isFresh, onToggle }: PacketRowProps) {
  return (
    <div
      className={`group bg-bg-surface border rounded-md px-3.5 py-2.5 cursor-pointer ${
        expanded
          ? "border-primary bg-primary/10"
          : isFresh
            ? "packet-fresh"
            : "border-border hover:border-text-dim/30 hover:bg-bg-raised/50"
      }`}
      onClick={() => onToggle()}
      aria-pressed={expanded}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs font-semibold text-primary tracking-wider">
          {formatHex(packet.packetHash)}
        </span>
        <Badge variant={payloadTypeVariant(packet.payloadType)}>
          {PAYLOAD_TYPE_NAMES[packet.payloadType as PayloadTypeValue] ?? packet.payloadTypeName}
        </Badge>
        {packet.summary && (
          <span className="flex-1 text-text-bright text-xs whitespace-nowrap overflow-hidden text-ellipsis">
            {packet.summary}
          </span>
        )}
        <Tooltip label={`Heard by ${packet.observationCount} observer${packet.observationCount === 1 ? "" : "s"}`}>
          <span
            className="font-mono text-[11px] text-primary font-semibold whitespace-nowrap bg-primary/6 px-1.5 rounded-sm"
            aria-label={`Heard by ${packet.observationCount} observer${packet.observationCount === 1 ? "" : "s"}`}
          >
            ×{packet.observationCount}
          </span>
        </Tooltip>
      </div>

      <div className="flex items-center gap-2 mt-1 text-[11px] text-text-dim">
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-wider bg-text-muted/8 px-1.5 py-px rounded-sm">
          {packet.routeTypeName || "Unknown"}
        </span>
        {packet.scope && (
          <>
            <span className="text-[6px] text-border" aria-hidden>·</span>
            <ScopeTag>{packet.scope}</ScopeTag>
          </>
        )}
        <span className="text-[6px] text-border" aria-hidden>·</span>
        <Timestamp value={packet.lastHeardAt} />
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
    </div>
  );
}
