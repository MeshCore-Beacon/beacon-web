import { formatHex } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import { Badge } from "../../components/Badge";
import { ScopeTag } from "../../components/ScopeTag";
import { payloadTypeVariant } from "../../components/badge-utils";
import { PAYLOAD_TYPE_NAMES, type PayloadTypeValue } from "../../types/enums";
import type { PacketSummary } from "../../types/api";
import { GRID_TEMPLATE } from "./packet-grid";
import { PacketEndpoints } from "./PacketEndpoints";

interface PacketTableRowProps {
  packet: PacketSummary;
  expanded: boolean;
  isFresh?: boolean;
  onToggle: () => void;
}

// Single-line table row sharing GRID_TEMPLATE with the sticky header. The observer lives in the
// expansion instead, which frees the wide column for the packet's endpoints.
export function PacketTableRow({ packet, expanded, isFresh, onToggle }: PacketTableRowProps) {
  // ?? not ||, so a legitimate 0-hop direct packet still shows its count
  const pathLength = packet.latestObserver?.pathLength;
  const na = <span className="text-text-dim">n/a</span>;

  return (
    <div
      className={`border-b ${
        expanded
          ? "border-primary bg-primary/10"
          : isFresh
            ? "packet-fresh border-border-subtle"
            : "border-border-subtle hover:bg-bg-raised/50"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="grid w-full items-center gap-x-3 px-3 py-1.5 text-left text-[11px] cursor-pointer"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        <span className={`text-text-dim transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden>
          ›
        </span>
        <span className="font-mono text-xs font-semibold text-primary tracking-wider">
          {formatHex(packet.packetHash)}
        </span>
        <span>
          <Badge variant={payloadTypeVariant(packet.payloadType)}>
            {PAYLOAD_TYPE_NAMES[packet.payloadType as PayloadTypeValue] ?? packet.payloadTypeName}
          </Badge>
        </span>
        <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
          {packet.routeTypeName || "Unknown"}
          {packet.scope && <ScopeTag>{packet.scope}</ScopeTag>}
        </span>
        <span className="font-mono text-text-muted">×{packet.observationCount}</span>
        <span className="font-mono text-text-muted">{pathLength?.hopCount ?? na}</span>
        <span className="font-mono text-text-muted">{pathLength?.hashSize ?? na}</span>
        <span className="min-w-0 overflow-hidden">
          <PacketEndpoints packet={packet} />
        </span>
        <span className="font-mono font-bold text-primary tracking-wider">
          {packet.latestObserver?.iata ?? <span className="font-normal">{na}</span>}
        </span>
        <span className="text-right text-text-muted">
          <Timestamp value={packet.lastHeardAt} />
        </span>
      </button>
    </div>
  );
}
