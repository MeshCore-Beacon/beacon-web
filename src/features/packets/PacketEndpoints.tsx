import type { PacketSummary, ResolvedHop } from "../../types/api";
import { PayloadType, type PathConfidence } from "../../types/enums";
import { HopPopover } from "./PathData";

// Same three-state vocabulary PathData uses in the analyzer.
const CONFIDENCE_CLASSES: Record<PathConfidence, string> = {
  high: "bg-green/8 text-green",
  ambiguous: "bg-warn/8 text-warn",
  none: "bg-text-muted/8 text-text-dim",
};

function Chip({ hop }: { hop: ResolvedHop }) {
  const node = hop.nodes[0];
  const label = node ? node.name ?? node.publicKey.slice(0, 8) : "?";
  return (
    <HopPopover hop={hop} showSnr={false} focusable>
      <span className={`font-mono text-[10px] px-1.5 py-px rounded-sm truncate ${CONFIDENCE_CLASSES[hop.confidence]}`}>
        {label}{hop.nodes.length > 1 ? ` +${hop.nodes.length - 1}` : ""}
      </span>
    </HopPopover>
  );
}

const Na = () => <span className="text-text-dim">n/a</span>;

// Keep every candidate: a short endpoint hash can match several nodes.
export function PacketEndpoints({ packet }: { packet: PacketSummary }) {
  const source = packet.latestObserver?.resolvedSource;
  const destination = packet.latestObserver?.resolvedDestination;

  // An advert is the node announcing itself, so its name is the whole story — no destination.
  if (packet.payloadType === PayloadType.ADVERT) {
    if (source) return <Chip hop={source} />;
    return packet.summary
      ? <span className={`font-mono text-[10px] px-1.5 py-px rounded-sm truncate ${CONFIDENCE_CLASSES.high}`} title={packet.summary}>{packet.summary}</span>
      : <Na />;
  }

  if (!source && !destination) {
    return packet.summary
      ? <span className="block truncate font-mono text-[10px] text-text-muted tracking-wider" title={packet.summary}>{packet.summary}</span>
      : <Na />;
  }

  return (
    <span className="flex items-center gap-x-1 min-w-0">
      {source ? <Chip hop={source} /> : <Na />}
      <span className="text-text-dim px-0.5" aria-hidden>→</span>
      {destination ? <Chip hop={destination} /> : <Na />}
    </span>
  );
}
