import { useQuery } from "@tanstack/react-query";
import { getNode, getNodeObservations, getNodeNeighbors } from "../../api/client";
import { Badge } from "../../components/Badge";
import { DetailPanel, Section, Field } from "../../components/DetailPanel";
import { IataChip } from "../../components/IataChip";
import { formatHex, formatSnr, snrLevel, formatRadio, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import type { NodeObservation, NodeNeighbor } from "./types";

function NodeNeighborRow({ neighbor, onClick }: { neighbor: NodeNeighbor; onClick?: () => void }) {
  return (
    <div
      className={`bg-bg-base border border-border rounded px-3 py-2 ${onClick ? "cursor-pointer hover:bg-white/3" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className={`font-mono font-semibold tracking-wider truncate ${neighbor.name ? "text-primary" : "text-text-dim italic"}`}>
          {neighbor.name ?? formatHex(neighbor.id)}
        </span>
        <Badge variant="default">{neighbor.nodeTypeName}</Badge>
        <IataChip>{neighbor.iata}</IataChip>
        <Timestamp value={neighbor.lastSeen} className="text-text-dim ml-auto font-mono text-[11px]" />
      </div>
      <div className="font-mono text-[11px] text-text-muted mt-1 flex items-center gap-2">
        <span className="truncate" title={neighbor.publicKey}>{neighbor.publicKey}</span>
        <span className="shrink-0 text-text-dim">·</span>
        <span className="shrink-0">{neighbor.observationCount.toLocaleString()} obs</span>
      </div>
    </div>
  );
}

function NodeObservationRow({ obs, onClick }: { obs: NodeObservation; onClick?: () => void }) {
  const level = snrLevel(obs.snr);
  return (
    <div
      className={`bg-bg-base border border-border rounded px-3 py-2 border-l-2 border-l-primary ${onClick ? "cursor-pointer hover:bg-white/3" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11px] mb-1.5">
        <Badge variant="default">{obs.payloadTypeName}</Badge>
        <IataChip>{obs.iata}</IataChip>
        <Timestamp value={obs.heardAt} className="text-text-dim ml-auto font-mono text-[11px]" />
      </div>
      <div className="flex gap-5 font-mono text-xs">
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">SNR</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>
            {formatSnr(obs.snr)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">RSSI</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>
            {obs.rssi ?? "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">Hops</span>
          <span className="font-medium text-text-normal">{obs.hopCount ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}

interface NodeDetailPanelProps {
  nodeId: string;
  onClose: () => void;
  onViewObserver: (observerId: string) => void;
  onViewNode?: (nodeId: string) => void;
  onAnalyzePacket?: (hash: string) => void;
}

export function NodeDetailPanel({ nodeId, onClose, onViewObserver, onViewNode, onAnalyzePacket }: NodeDetailPanelProps) {
  const { data: node, isLoading } = useQuery({
    queryKey: ["node", nodeId],
    queryFn: () => getNode(nodeId),
    staleTime: 30_000,
  });

  const { data: observations } = useQuery({
    queryKey: ["node-observations", nodeId],
    queryFn: () => getNodeObservations(nodeId, { limit: 50 }),
    staleTime: 30_000,
  });

  const { data: neighbors } = useQuery({
    queryKey: ["node-neighbors", nodeId],
    queryFn: () => getNodeNeighbors(nodeId),
    staleTime: 30_000,
  });

  const hasLocation = node != null && node.lat != null && node.lng != null;

  return (
    <DetailPanel
      title="Node Detail"
      onClose={onClose}
      isLoading={isLoading}
      notFound={!node}
      notFoundLabel="Node not found"
      notFoundIcon={
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-border">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      }
    >
      {node && (
        <>
          <Section title="Summary" first>
              <div className="flex items-center gap-2 mb-2">
                <span className={`font-mono text-xs font-semibold tracking-wider ${node.name ? "text-primary" : "text-text-dim italic"}`}>
                  {node.name ?? formatHex(node.id)}
                </span>
                <Badge variant="default">{node.nodeTypeName}</Badge>
              </div>
              <div className="font-mono text-[13px] text-text-muted truncate" title={node.publicKey}>
                {node.publicKey}
              </div>
              {node.observerId && (
                <button
                  type="button"
                  onClick={() => onViewObserver(node.observerId!)}
                  className="mt-2 block font-mono text-[11px] text-primary hover:underline"
                >
                  View observer →
                </button>
              )}
            </Section>

            {(hasLocation || node.locationSource) && (
              <Section title="Location">
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[13px]">
                  {node.lat != null && <Field label="Lat" value={node.lat.toFixed(5)} />}
                  {node.lng != null && <Field label="Lng" value={node.lng.toFixed(5)} />}
                  {node.locationSource && <Field label="Source" value={node.locationSource} />}
                </div>
              </Section>
            )}

            <Section title="Capabilities">
              <div className="flex flex-col gap-0.5 font-mono text-[13px]">
                {node.minFirmwareVersion && <Field label="Min firmware" value={node.minFirmwareVersion} />}
                <Field label="Multibyte paths" value={node.supportsMultibytePaths ? "yes" : "no"} />
                <Field label="Multibyte traces" value={node.supportsMultibyteTraces ? "yes" : "no"} />
                {node.radio && <Field label="Radio" value={formatRadio(node.radio) ?? "—"} />}
                {node.defaultScope && <Field label="Scope" value={node.defaultScope} />}
              </div>
            </Section>

            <Section title="Timestamps">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[13px]">
                <Field label="First" value={<Timestamp value={node.firstSeen} />} />
                <Field label="Last" value={<Timestamp value={node.lastSeen} />} />
                {node.lastAdvertAt != null && <Field label="Advert" value={<Timestamp value={node.lastAdvertAt} />} />}
              </div>
            </Section>

            <Section title={node.knownNeighborCount > 0 ? `Neighbors (${node.knownNeighborCount})` : "Neighbors"}>
              {neighbors && neighbors.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {neighbors.map((n) => (
                    // the endpoint returns one row per (neighbor, iata), so the node id alone repeats
                    <NodeNeighborRow
                      key={`${n.id}-${n.iata}`}
                      neighbor={n}
                      onClick={onViewNode ? () => onViewNode(n.id) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="font-mono text-[13px] text-text-dim">No known neighbors</div>
              )}
            </Section>

            <Section title="Observations">
              {observations && observations.items.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {observations.items.map((obs) => (
                    <NodeObservationRow
                      key={obs.id}
                      obs={obs}
                      onClick={onAnalyzePacket ? () => onAnalyzePacket(obs.packetHash) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="font-mono text-[13px] text-text-dim">No recent observations</div>
              )}
            </Section>
        </>
      )}
    </DetailPanel>
  );
}
