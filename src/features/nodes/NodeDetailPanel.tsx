import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getNode, getNodeObservations, getNodeNeighbors, isNotFound } from "../../api/client";
import { Badge } from "../../components/Badge";
import { DetailPanel, Section, Field, FoldSection } from "../../components/DetailPanel";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { CopyButton } from "../../components/CopyButton";
import { CopyLinkButton } from "../../components/CopyLinkButton";
import { IataChip } from "../../components/IataChip";
import { formatHex, formatSnr, snrLevel, formatRadio, formatClockDrift, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import { hasMapLocation } from "../map/location";
import type { NodeObservation, NodeNeighbor } from "./types";
import { ForeignNodeBadge } from "./ForeignNodeBadge";
import { TypeChip, RoleChip, CautionChip } from "../../components/NodeChips";
import { MeshMapperSection } from "./MeshMapperSection";
import { Tooltip } from "../../components/Tooltip";
import { EmojiText } from "../../components/EmojiText";
import { useFeatures } from "../../hooks/useFeatures";
import { useRequestsAvailable } from "../../hooks/useTelemetryRequests";
import { RequestTelemetry } from "./RequestTelemetry";
import { Segmented } from "../stats/Segmented";

// Pulls in ECharts, so it stays out of the main bundle; mounted only for polled node types.
import { isPolledNodeType } from "./polledType";
const NodeTelemetrySection = lazy(() => import("./NodeTelemetrySection"));
const NodeObserverSection = lazy(() => import("./NodeObserverSection"));

export type NodeView = "node" | "observer";

const SUBHEAD = "mt-2 mb-0.5 font-mono text-[10px] uppercase tracking-wider text-text-dim first:mt-0";

function NodeNeighborRow({ neighbor, onClick }: { neighbor: NodeNeighbor; onClick?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className={`bg-bg-base border border-border rounded px-3 py-2 ${onClick ? "cursor-pointer hover:bg-text-normal/3" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11px]">
        <span className={`font-mono font-semibold tracking-wider truncate ${neighbor.name ? "text-primary" : "text-text-dim italic"}`}>
          <EmojiText text={neighbor.name ?? formatHex(neighbor.id)} />
        </span>
        <Badge variant="default">{neighbor.nodeTypeName}</Badge>
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

function NodeQueryError({ section, previousData, isFetching, onRetry }: { section: string; previousData: boolean; isFetching: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="mb-2 space-y-1 font-mono text-[13px] text-danger">
      <p>{t("common.loadFailed")}</p>
      {previousData && <p className="text-text-muted">{t("nodeDetail.previousData")}</p>}
      <button type="button" disabled={isFetching} aria-label={t("nodeDetail.retrySection", { section })} className={ACTION_BUTTON_CLASS} onClick={onRetry}>
        {t("nodeDetail.retry")}
      </button>
    </div>
  );
}

interface NodeDetailPanelProps {
  nodeId: string;
  onClose: () => void;
  // another observer, e.g. a poller; may open its node panel
  onViewObserver: (observerId: string) => void;
  // this node's own observer dashboard; defaults to onViewObserver
  onOpenObserverDashboard?: (observerId: string) => void;
  onViewNode?: (nodeId: string) => void;
  onAnalyzePacket?: (hash: string, observationId?: number) => void;
  onViewOnMap?: (lat: number, lng: number) => void;
  // controlled when onViewChange is given (the docked panel keeps it in the URL), else local state
  view?: NodeView;
  onViewChange?: (view: NodeView) => void;
}

export function NodeDetailPanel({ nodeId, onClose, onViewObserver, onOpenObserverDashboard, onViewNode, onAnalyzePacket, onViewOnMap, view, onViewChange }: NodeDetailPanelProps) {
  const { t } = useTranslation();
  const [localView, setLocalView] = useState<NodeView>(view ?? "node");
  const requestedView = onViewChange ? view ?? "node" : localView;
  const setView = onViewChange ?? setLocalView;
  const nodeQuery = useQuery({
    queryKey: ["node", nodeId],
    queryFn: () => getNode(nodeId),
    staleTime: 30_000,
  });

  const observationsQuery = useQuery({
    queryKey: ["node-observations", nodeId],
    queryFn: () => getNodeObservations(nodeId, { limit: 50 }),
    staleTime: 30_000,
  });

  const neighborsQuery = useQuery({
    queryKey: ["node-neighbors", nodeId],
    queryFn: ({ signal }) => getNodeNeighbors(nodeId, signal),
    staleTime: 30_000,
  });

  const node = nodeQuery.data;
  const observations = observationsQuery.data;
  const neighbors = neighborsQuery.data;
  const missing = nodeQuery.isError && isNotFound(nodeQuery.error);

  const hasLocation = hasMapLocation(node);
  const features = useFeatures();
  // An observer reports its own readings over MQTT, so it is never polled or requested.
  const observerId = node?.observerId ?? null;
  const shownView: NodeView = observerId ? requestedView : "node";
  const showTelemetry = features.polling && !!node && isPolledNodeType(node.nodeTypeName) && !observerId;
  const canRequest = useRequestsAvailable();
  // Handed to the lazy chart section so it sits inside it, without that chunk importing it.
  const requestBlock = canRequest && !!node && isPolledNodeType(node.nodeTypeName) && !observerId ? <RequestTelemetry key={node.id} node={node} /> : null;
  const telemetryInfo = requestBlock ? [t("nodeDetail.telemetry.requestIntro"), t("nodeDetail.telemetry.passwordNotice")] : undefined;
  const LINK = "font-mono text-[11px] text-primary hover:underline";

  return (
    <DetailPanel
      title={t("nodeDetail.title")}
      onClose={onClose}
      collapsible
      headerAction={<CopyLinkButton params={() => ({ tab: "Nodes", node: nodeId, view: shownView === "observer" ? "observer" : null })} ariaLabel={t("nodeDetail.copyLink")} />}
      isLoading={nodeQuery.isPending}
      notFound={missing || (nodeQuery.isSuccess && !node)}
      notFoundLabel={t("nodeDetail.notFound")}
      notFoundIcon={
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-border">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      }
    >
      {nodeQuery.isError && !missing && <div className="px-3 py-2.5">
        <NodeQueryError section={t("nodeDetail.title")} previousData={!!node} isFetching={nodeQuery.isFetching} onRetry={() => void nodeQuery.refetch()} />
      </div>}
      {node && (
        <>
          <Section title={t("nodeDetail.summary")} first>
            <div data-summary>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`font-mono text-xs font-semibold tracking-wider ${node.name ? "text-primary" : "text-text-dim italic"}`}>
                  <EmojiText text={node.name ?? formatHex(node.id)} />
                </span>
                <TypeChip typeName={node.nodeTypeName} />
                {node.isPoller && <RoleChip role="poller" />}
                {(node.isObserver || node.isPoller) && <RoleChip role="observer" />}
                <ForeignNodeBadge possiblyForeign={node.possiblyForeign} />
                {node.meshmapper?.carpeater && (
                  <Tooltip label={t("nodeDetail.carpeaterHint")} focusable>
                    <CautionChip>{t("nodeDetail.carpeater")}</CautionChip>
                  </Tooltip>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-[13px] text-text-muted truncate min-w-0 flex-1" title={node.publicKey}>
                  {node.publicKey}
                </div>
                <CopyButton value={node.publicKey} ariaLabel={t("nodeDetail.copyKey")} className="shrink-0" />
              </div>
              <div className="mt-1 font-mono text-[13px]">
                <Field label={t("nodeDetail.lastSeen")} value={<Timestamp value={node.lastSeen} />} />
              </div>
              {hasMapLocation(node) && onViewOnMap && (
                <div className="mt-2 flex gap-4">
                  <button type="button" onClick={() => onViewOnMap(node.lat, node.lng)} className={LINK}>
                    {t("nodeDetail.viewOnMap")}
                  </button>
                </div>
              )}
              {observerId && (
                <Segmented
                  stretch
                  size="xs"
                  className="mt-2.5"
                  ariaLabel={t("nodeDetail.view")}
                  value={shownView}
                  onChange={(v) => setView(v as NodeView)}
                  options={[{ value: "node", label: t("nodeDetail.viewNode") }, { value: "observer", label: t("nodeDetail.viewObserver") }]}
                />
              )}
            </div>
            </Section>

            {shownView === "observer" && observerId ? (
              <Suspense fallback={<p role="status" className="px-3 py-2.5 font-mono text-[13px] text-text-dim">{t("common.loading")}</p>}>
                <NodeObserverSection key={observerId} observerId={observerId} onOpenDashboard={() => (onOpenObserverDashboard ?? onViewObserver)(observerId)} onAnalyzePacket={onAnalyzePacket} />
              </Suspense>
            ) : <>
            <Section title={t("nodeDetail.details")}>
              {(hasLocation || node.locationSource) && (
                <>
                  <div className={SUBHEAD}>{t("nodeDetail.location")}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[13px]">
                    {hasLocation && <Field label={t("nodeDetail.lat")} value={node.lat!.toFixed(5)} />}
                    {hasLocation && <Field label={t("nodeDetail.lng")} value={node.lng!.toFixed(5)} />}
                    {node.locationSource && <Field label={t("nodeDetail.source")} value={node.locationSource} />}
                  </div>
                </>
              )}
              <div className={SUBHEAD}>{t("nodeDetail.capabilities")}</div>
              <div className="flex flex-col gap-0.5 font-mono text-[13px]">
                {node.minFirmwareVersion && <Field label={t("nodeDetail.minFirmware")} value={node.minFirmwareVersion} />}
                <Field label={t("nodeDetail.multibytePaths")} value={node.supportsMultibytePaths ? t("nodeDetail.yes") : t("nodeDetail.no")} />
                <Field label={t("nodeDetail.multibyteTraces")} value={node.supportsMultibyteTraces ? t("nodeDetail.yes") : t("nodeDetail.no")} />
                {node.radio && <Field label={t("nodeDetail.radio")} value={formatRadio(node.radio) ?? "—"} />}
                {node.defaultScope && <Field label={t("nodeDetail.scope")} value={node.defaultScope} />}
              </div>
              <div className={SUBHEAD}>{t("nodeDetail.timestamps")}</div>
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

            {node.meshmapper && <MeshMapperSection mm={node.meshmapper} />}

            {showTelemetry ? (
              <Suspense fallback={null}>
                <NodeTelemetrySection key={node.id} node={node} onViewObserver={onViewObserver} extra={requestBlock} info={telemetryInfo} />
              </Suspense>
            ) : requestBlock && <FoldSection id="node-telemetry" title={t("nodeDetail.telemetry.title")} info={telemetryInfo}>{requestBlock}</FoldSection>}

            <FoldSection id="node-neighbors" title={node.knownNeighborCount > 0 ? t("nodeDetail.neighborsCount", { count: node.knownNeighborCount }) : t("nodeDetail.neighbors")}>
              {neighborsQuery.isError && <NodeQueryError section={t("nodeDetail.neighbors")} previousData={!!neighbors?.length} isFetching={neighborsQuery.isFetching} onRetry={() => void neighborsQuery.refetch()} />}
              {neighborsQuery.isPending ? <p role="status" className="font-mono text-[13px] text-text-dim">{t("common.loading")}</p> : neighbors && neighbors.length > 0 ? (
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
              ) : !neighborsQuery.isError && (
                <div className="font-mono text-[13px] text-text-dim">{t("nodeDetail.noNeighbors")}</div>
              )}
            </FoldSection>

            <FoldSection
              id="node-packets"
              title={t("nodeDetail.recentPackets")}
              info={[t("nodeDetail.packetsSentInfo"), t("nodeDetail.packetsSentExpire")]}
              summary={observations && observations.items.length > 0 ? <Timestamp value={observations.items[0]!.heardAt} /> : undefined}
            >
              {observationsQuery.isError && <NodeQueryError section={t("nodeDetail.recentPackets")} previousData={!!observations?.items.length} isFetching={observationsQuery.isFetching} onRetry={() => void observationsQuery.refetch()} />}
              {observationsQuery.isPending ? <p role="status" className="font-mono text-[13px] text-text-dim">{t("common.loading")}</p> : observations && observations.items.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {observations.items.map((obs) => (
                    <NodeObservationRow
                      key={obs.id}
                      obs={obs}
                      onClick={onAnalyzePacket ? () => onAnalyzePacket(obs.packetHash) : undefined}
                    />
                  ))}
                </div>
              ) : !observationsQuery.isError && (
                <div className="font-mono text-[13px] text-text-dim">{t("nodeDetail.noRecentPackets")}</div>
              )}
            </FoldSection>
            </>}
        </>
      )}
    </DetailPanel>
  );
}
