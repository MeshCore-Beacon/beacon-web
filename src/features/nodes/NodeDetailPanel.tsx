import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getNode, getNodeObservations, getNodeNeighbors } from "../../api/client";
import { NodeTypeBadge } from "../../components/NodeTypeBadge";
import { Badge } from "../../components/Badge";
import { DetailPanel, Section, Field } from "../../components/DetailPanel";
import { CopyButton } from "../../components/CopyButton";
import { CopyLinkButton } from "../../components/CopyLinkButton";
import { IataChip } from "../../components/IataChip";
import { formatHex, formatSnr, snrLevel, formatRadio, formatClockDrift, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import { hasMapLocation } from "../map/location";
import type { NodeObservation, NodeNeighbor } from "./types";
import { ForeignNodeBadge } from "./ForeignNodeBadge";

function NodeNeighborRow({ neighbor, onClick }: { neighbor: NodeNeighbor; onClick?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className={`bg-bg-base border border-border rounded px-3 py-2 ${onClick ? "cursor-pointer hover:bg-text-normal/3" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className={`font-mono font-semibold tracking-wider truncate ${neighbor.name ? "text-primary" : "text-text-dim italic"}`}>
          {neighbor.name ?? formatHex(neighbor.id)}
        </span>
        <NodeTypeBadge typeName={neighbor.nodeTypeName} />
        <IataChip>{neighbor.iata}</IataChip>
        <Timestamp value={neighbor.lastSeen} className="text-text-dim ml-auto font-mono text-[11px]" />
      </div>
      <div className="font-mono text-[11px] text-text-muted mt-1 flex items-center gap-2">
        <span className="truncate" title={neighbor.publicKey}>{neighbor.publicKey}</span>
        <span className="shrink-0 text-text-dim">·</span>
        <span className="shrink-0">{t("nodeDetail.observations", { count: neighbor.observationCount, formatted: neighbor.observationCount.toLocaleString() })}</span>
      </div>
    </div>
  );
}

function NodeObservationRow({ obs, onClick }: { obs: NodeObservation; onClick?: () => void }) {
  const { t } = useTranslation();
  const level = snrLevel(obs.snr);
  return (
    <div
      className={`bg-bg-base border border-border rounded px-3 py-2 border-l-2 border-l-primary ${onClick ? "cursor-pointer hover:bg-text-normal/3" : ""}`}
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
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">{t("nodeDetail.hops")}</span>
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
  onViewOnMap?: (lat: number, lng: number) => void;
}

export function NodeDetailPanel({ nodeId, onClose, onViewObserver, onViewNode, onAnalyzePacket, onViewOnMap }: NodeDetailPanelProps) {
  const { t } = useTranslation();
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

  const hasLocation = hasMapLocation(node);
  const fullLink = new URL(window.location.href);
  fullLink.searchParams.set("tab", "Nodes"); fullLink.searchParams.set("nodePage", nodeId);
  for (const key of ["node", "hash", "analyze", "path", "observation"]) fullLink.searchParams.delete(key);

  return (
    <DetailPanel
      title={t("nodeDetail.title")}
      onClose={onClose}
      collapsible
      headerAction={<div className="flex flex-wrap items-center gap-2"><a className="min-h-9 content-center text-[11px] text-primary hover:underline" href={fullLink.pathname + fullLink.search}>{t("nodePage.open")}</a><CopyLinkButton params={{ tab: "Nodes", node: nodeId }} ariaLabel={t("nodeDetail.copyLink")} /></div>}
      isLoading={isLoading}
      notFound={!node}
      notFoundLabel={t("nodeDetail.notFound")}
      notFoundIcon={
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-border">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      }
    >
      {node && (
        <>
          <Section title={t("nodeDetail.summary")} first>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`font-mono text-xs font-semibold tracking-wider ${node.name ? "text-primary" : "text-text-dim italic"}`}>
                  {node.name ?? formatHex(node.id)}
                </span>
                <NodeTypeBadge typeName={node.nodeTypeName} observer={node.isObserver} />
                <ForeignNodeBadge possiblyForeign={node.possiblyForeign} />
              </div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-[13px] text-text-muted truncate min-w-0 flex-1" title={node.publicKey}>
                  {node.publicKey}
                </div>
                <CopyButton value={node.publicKey} ariaLabel={t("nodeDetail.copyKey")} className="shrink-0" />
              </div>
              {node.observerId && (
                <button
                  type="button"
                  onClick={() => onViewObserver(node.observerId!)}
                  className="mt-2 block font-mono text-[11px] text-primary hover:underline"
                >
                  {t("nodeDetail.viewObserver")}
                </button>
              )}
            </Section>

            {(hasLocation || node.locationSource) && (
              <Section title={t("nodeDetail.location")}>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[13px]">
                  {hasLocation && <Field label={t("nodeDetail.lat")} value={node.lat!.toFixed(5)} />}
                  {hasLocation && <Field label={t("nodeDetail.lng")} value={node.lng!.toFixed(5)} />}
                  {node.locationSource && <Field label={t("nodeDetail.source")} value={node.locationSource} />}
                </div>
                {hasMapLocation(node) && onViewOnMap && (
                  <button
                    type="button"
                    onClick={() => onViewOnMap(node.lat, node.lng)}
                    className="mt-2 block font-mono text-[11px] text-primary hover:underline"
                  >
                    {t("nodeDetail.viewOnMap")}
                  </button>
                )}
              </Section>
            )}

            <Section title={t("nodeDetail.capabilities")}>
              <div className="flex flex-col gap-0.5 font-mono text-[13px]">
                {node.minFirmwareVersion && <Field label={t("nodeDetail.minFirmware")} value={node.minFirmwareVersion} />}
                <Field label={t("nodeDetail.multibytePaths")} value={node.supportsMultibytePaths ? t("nodeDetail.yes") : t("nodeDetail.no")} />
                <Field label={t("nodeDetail.multibyteTraces")} value={node.supportsMultibyteTraces ? t("nodeDetail.yes") : t("nodeDetail.no")} />
                {node.radio && <Field label={t("nodeDetail.radio")} value={formatRadio(node.radio) ?? "—"} />}
                {node.defaultScope && <Field label={t("nodeDetail.scope")} value={node.defaultScope} />}
              </div>
            </Section>

            <Section title={t("nodeDetail.timestamps")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[13px]">
                <Field label={t("nodeDetail.first")} value={<Timestamp value={node.firstSeen} />} />
                <Field label={t("nodeDetail.last")} value={<Timestamp value={node.lastSeen} />} />
                {node.lastAdvertAt != null && <Field label={t("nodeDetail.advert")} value={<Timestamp value={node.lastAdvertAt} />} />}
                {node.clockDriftSeconds != null && (
                  <Field
                    label={t("nodeDetail.clockDrift")}
                    value={<span className={node.clockOutOfSync ? "text-warn" : "text-green"}>{formatClockDrift(node.clockDriftSeconds, { inSync: t("clockDrift.inSync"), ahead: t("clockDrift.ahead"), behind: t("clockDrift.behind") })}</span>}
                  />
                )}
              </div>
            </Section>

            <Section title={node.knownNeighborCount > 0 ? t("nodeDetail.neighborsCount", { count: node.knownNeighborCount }) : t("nodeDetail.neighbors")}>
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
                <div className="font-mono text-[13px] text-text-dim">{t("nodeDetail.noNeighbors")}</div>
              )}
            </Section>

            <Section title={t("nodeDetail.recentPackets")}>
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
                <div className="font-mono text-[13px] text-text-dim">{t("nodeDetail.noRecentPackets")}</div>
              )}
            </Section>
        </>
      )}
    </DetailPanel>
  );
}
