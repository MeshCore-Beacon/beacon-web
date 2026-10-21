import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isNotFound } from "../../api/client";
import { queryRetryDelay } from "../../api/rate-limit";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { Badge } from "../../components/Badge";
import { IataChip } from "../../components/IataChip";
import { InfoTip } from "../../components/InfoTip";
import { Timestamp } from "../../components/Timestamp";
import { formatBattery, formatCount, formatHex, formatRadio, formatRadioParts, formatUptime } from "../../lib/formatters";
import type { Observation } from "../../types/api";
import type { NodeSummary } from "../nodes/types";
import { deriveObserverStatus } from "../observers/observer-status";
import { usePacketDetail } from "../packets/usePacketDetail";
import { Card, StatCard } from "../stats/cards";
import { useChartColors } from "../stats/chartTheme";
import { Segmented } from "../stats/Segmented";
import { average } from "../stats/signal";
import { REPORT_LIMIT, resolveObserverNode, type AtlasPin, type AtlasRange } from "./atlas";
import { ATLAS_REFRESH_MS, useAtlasNode } from "./useAtlas";
import { useAtlasObserver } from "./useAtlasObserver";
import type { CardHandleProps } from "./useCardDrag";
import { CollectedNodeTelemetry } from "../nodes/CollectedNodeTelemetry";

export type AtlasView = "analytics" | "heard" | "observer";

export interface AtlasActions {
  onViewNode: (id: string) => void;
  onViewObserver: (id: string) => void;
  onAnalyzePacket: (hash: string, observationId?: number) => void;
}

interface AtlasCardProps extends AtlasActions {
  pin: AtlasPin;
  range: AtlasRange;
  active: boolean;
  view: AtlasView;
  onViewChange: (view: AtlasView) => void;
  onRemove: () => void;
  onResolved: (id: string, observerId?: string) => void;
  onUpgrade: (node: NodeSummary, observerId: string) => void;
  handle: Partial<CardHandleProps>;
}

const VIEW_LABEL: Record<AtlasView, string> = { analytics: "atlas.viewAnalytics", heard: "atlas.viewHeard", observer: "atlas.viewObserver" };

// One pinned radio, laid out as the Signal tab's KPI row so Atlas and Analytics read the same way.
// A node that also observes gets a third view; an observer-only pin has just that view.
export function AtlasCard({
  pin,
  range,
  active,
  view,
  onViewChange,
  onRemove,
  onResolved,
  onUpgrade,
  handle,
  onViewNode,
  onViewObserver,
  onAnalyzePacket,
}: AtlasCardProps) {
  const { t } = useTranslation();
  const c = useChartColors();
  const nodePin = pin.kind === "node" ? pin : null;
  const { query, node, sample, capped } = useAtlasNode(nodePin, range, active);
  const observerId = pin.kind === "observer" ? pin.observerId : (node?.observerId ?? pin.observerId ?? null);
  const obs = useAtlasObserver(observerId, range, active, view === "observer");
  const observer = obs.observer.data;
  const views: AtlasView[] = pin.kind === "observer" ? ["observer"] : observerId ? ["analytics", "heard", "observer"] : ["analytics", "heard"];

  const latest = sample.reports[0];
  const heard = usePacketDetail(view === "heard" && latest ? latest.packetHash : null);
  const detail = heard.data;
  // Never show another node's observers if the packet record resolved to a different origin.
  const sameOrigin = !detail?.originPubkey || detail.originPubkey.toLowerCase() === nodePin?.publicKey;
  const observers = useMemo(() => {
    if (!detail || !sameOrigin) return [];
    const latestByObserver = new Map<string, Observation>();
    for (const row of detail.observations) {
      const previous = latestByObserver.get(row.observerId);
      if (!previous || row.heardAt > previous.heardAt) latestByObserver.set(row.observerId, row);
    }
    return [...latestByObserver.values()].sort((a, b) => b.heardAt - a.heardAt);
  }, [detail, sameOrigin]);

  // A pin recovered under a new server ID, or newly linked to an observer, is saved back. A node
  // record without the link (older server) keeps whatever link the pin already has.
  useEffect(() => {
    if (!nodePin || !node) return;
    const linked = node.observerId ?? nodePin.observerId;
    if (node.id !== nodePin.id || linked !== nodePin.observerId) onResolved(node.id, linked);
  }, [node, nodePin, onResolved]);

  // An observer that now advertises becomes a node pin so the card gains the node views. A query,
  // not an effect, so the lookup runs once per poll rather than on every parent render.
  const upgradeTo = useQuery({
    queryKey: ["atlas-observer-node", pin.kind === "observer" ? (observer?.publicKey ?? null) : null],
    queryFn: ({ signal }) => resolveObserverNode(observer!, signal),
    enabled: pin.kind === "observer" && active && !!observer?.publicKey,
    staleTime: ATLAS_REFRESH_MS,
    refetchInterval: ATLAS_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retryDelay: queryRetryDelay,
  });
  useEffect(() => {
    if (pin.kind === "observer" && upgradeTo.data) onUpgrade(upgradeTo.data, pin.observerId);
  }, [pin, upgradeTo.data, onUpgrade]);

  const name = (pin.kind === "node" ? node?.name : observer?.displayName) || pin.name;
  const hours = sample.counts.length;
  const activeHours = sample.present.filter(Boolean).length;
  const status = observer ? deriveObserverStatus(observer) : null;
  // The observer detail carries the radio as separate fields; the summary shape has the compact string.
  const radio = observer && (formatRadio(observer.radio) ?? formatRadioParts({ freqMhz: observer.radioFreqMhz, sf: observer.radioSf, bwKhz: observer.radioBwKhz, cr: observer.radioCr }));

  // The list view is fixed to the tiles' height and scrolls inside it, so flipping never resizes the card.
  const body = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<number>();
  const changeView = (next: AtlasView) => {
    if (view !== "heard") setHeld(body.current?.offsetHeight);
    onViewChange(next);
  };

  const title = (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pin.kind === "node" && !node}
        onClick={() => (pin.kind === "observer" ? onViewObserver(pin.observerId) : node && onViewNode(node.id))}
        className={`min-w-0 max-w-full truncate normal-case disabled:text-text-muted disabled:no-underline ${
          name ? "text-primary hover:underline" : "italic text-text-dim"
        }`}
      >
        {name || formatHex(pin.kind === "node" ? (node?.id ?? pin.id) : pin.observerId)}
      </button>
      {node && <Badge variant="default">{node.nodeTypeName}</Badge>}
      {node?.stale === false && <Badge variant="live">{t("atlas.recent")}</Badge>}
      {node?.stale === true && <Badge variant="stale">{t("atlas.stale")}</Badge>}
      {pin.kind === "observer" && observer?.observerType && <Badge variant="default">{observer.observerType}</Badge>}
      {pin.kind === "observer" && status && (
        <Badge variant={status === "online" ? "live" : "stale"}>{t(status === "online" ? "atlas.online" : "atlas.offline")}</Badge>
      )}
    </span>
  );

  const actions = (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {views.length > 1 && (
        <Segmented
          size="xs"
          ariaLabel={t("atlas.view")}
          value={view}
          onChange={(next) => changeView(next as AtlasView)}
          options={views.map((value) => ({ value, label: t(VIEW_LABEL[value]) }))}
        />
      )}
      <button type="button" className={ACTION_BUTTON_CLASS} onClick={onRemove}>
        {t("atlas.remove")}
      </button>
      <button
        type="button"
        className={`${ACTION_BUTTON_CLASS} cursor-grab touch-none active:cursor-grabbing`}
        aria-label={t("atlas.dragToReorder")}
        {...handle}
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
          <circle cx="2.5" cy="2" r="1.3" /><circle cx="7.5" cy="2" r="1.3" />
          <circle cx="2.5" cy="7" r="1.3" /><circle cx="7.5" cy="7" r="1.3" />
          <circle cx="2.5" cy="12" r="1.3" /><circle cx="7.5" cy="12" r="1.3" />
        </svg>
      </button>
    </div>
  );

  const retry = (refetch: () => Promise<unknown>) => (
    <p role="alert" className="text-sm text-danger">
      {t("common.loadFailed")}{" "}
      <button type="button" className={ACTION_BUTTON_CLASS} onClick={() => void refetch()}>
        {t("observerPage.retry")}
      </button>
    </p>
  );
  const dash = "—";

  return (
    <Card title={title} right={actions} wrap className="flex h-full flex-col">
      {pin.kind === "node" && query.isPending && <p role="status" className="text-sm text-text-muted">{t("common.loading")}</p>}
      {pin.kind === "node" && query.isError && isNotFound(query.error) && (
        <p role="alert" className="text-sm text-text-muted">{t("nodeDetail.notFound")}</p>
      )}
      {pin.kind === "node" && query.isError && !isNotFound(query.error) && retry(query.refetch)}
      {pin.kind === "observer" && obs.observer.isPending && <p role="status" className="text-sm text-text-muted">{t("common.loading")}</p>}
      {pin.kind === "observer" && obs.observer.isError && isNotFound(obs.observer.error) && (
        <p role="alert" className="text-sm text-text-muted">{t("atlas.observerGone")}</p>
      )}
      {pin.kind === "observer" && obs.observer.isError && !isNotFound(obs.observer.error) && retry(obs.observer.refetch)}
      {view === "analytics" && node && (
        <div ref={body} className="flex flex-1 flex-col gap-3">
          {node.nodeType === 2 && <CollectedNodeTelemetry publicKey={node.publicKey} active={active} compact />}
          <div className="grid flex-1 grid-cols-2 gap-3">
            <StatCard
              compact
              label={t("signal.receptions")}
              value={formatCount(sample.reports.length)}
              accent={c.series[0]!}
              spark={sample.counts}
              markPeak
              sublabel={capped ? t("atlas.sampleCapped", { limit: REPORT_LIMIT }) : t(`atlas.ranges.${range}`)}
            />
            <StatCard
              compact
              label={t("signal.meanSnr")}
              value={average(sample.snr, "dB")}
              accent={c.series[2]!}
              spark={sample.snrHourly}
            />
            <StatCard
              compact
              label={t("signal.meanRssi")}
              value={average(sample.rssi, "dBm")}
              accent={c.series[1]!}
              spark={sample.rssiHourly}
            />
            <StatCard
              compact
              label={t("signal.hoursWithRecords")}
              value={`${activeHours}/${hours}`}
              accent={c.series[3]!}
              presence={sample.present}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-muted">
            {node.lastSeen > 0 && (
              <span>
                {t("atlas.lastSeen")} <Timestamp value={node.lastSeen} />
              </span>
            )}
            <span>
              {t("atlas.meanHops")} {average(sample.hops)}
            </span>
            <span className="whitespace-nowrap">
              {t("nodeDetail.neighborsCount", { count: node.knownNeighborCount })}{" "}
              <InfoTip text={[t("atlas.sampleHelp", { limit: REPORT_LIMIT }), capped && t("atlas.cappedHelp")]} />
            </span>
          </div>
        </div>
      )}
      {view === "heard" && node && (
        <div className="flex flex-col overflow-hidden font-mono text-xs" style={{ height: held }}>
          {!latest ? (
            <p className="text-text-muted">{t("atlas.noReports")}</p>
          ) : heard.isPending ? (
            <p role="status" className="text-text-muted">{t("common.loading")}</p>
          ) : heard.isError || !sameOrigin ? (
            <p className="text-text-muted">{t("atlas.heardUnavailable")}</p>
          ) : (
            <>
              <p className="mb-1 text-text-muted">
                {t("atlas.observers", { count: observers.length })} <Timestamp value={latest.heardAt} />
              </p>
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {observers.map((row) => (
                  <li key={row.observerId} className="flex items-center justify-between gap-2 border-t border-border-subtle py-1">
                    <button
                      type="button"
                      className="min-w-0 truncate text-left text-primary hover:underline"
                      onClick={() => onViewObserver(row.observerId)}
                    >
                      {row.observerName || formatHex(row.observerId)}
                    </button>
                    <IataChip className="shrink-0">{row.iata}</IataChip>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`${ACTION_BUTTON_CLASS} mt-2 self-start`}
                onClick={() => onAnalyzePacket(latest.packetHash, latest.id)}
              >
                {t("atlas.openPacket")}
              </button>
            </>
          )}
        </div>
      )}
      {view === "observer" && observerId && (pin.kind === "observer" ? observer : node) && (
        <div ref={body} className="flex flex-1 flex-col gap-3">
          <div className="grid flex-1 grid-cols-2 gap-3">
            <StatCard
              compact
              label={t("atlas.packetsHeard")}
              value={obs.sample.heard === null ? dash : formatCount(obs.sample.heard)}
              accent={c.series[0]!}
              spark={obs.sample.counts}
              markPeak
              sublabel={t(`atlas.ranges.${range}`)}
            />
            <StatCard
              compact
              label={t("atlas.meanSnrHeard")}
              value={obs.sample.snr === null ? dash : `${obs.sample.snr.toFixed(1)} dB`}
              accent={c.series[2]!}
              spark={obs.sample.snrHourly}
            />
            <StatCard
              compact
              label={t("atlas.noiseFloor")}
              value={obs.sample.noise === null ? dash : `${Math.round(obs.sample.noise)} dB`}
              accent={c.series[1]!}
              spark={obs.sample.noiseHourly}
            />
            {obs.sample.battery !== null ? (
              <StatCard compact label={t("atlas.battery")} value={formatBattery(obs.sample.battery)} accent={c.series[3]!} spark={obs.sample.batteryHourly} />
            ) : (
              <StatCard compact label={t("atlas.uptime")} value={obs.sample.uptime === null ? dash : formatUptime(obs.sample.uptime)} accent={c.series[3]!} />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-text-muted">
            {status && <span>{t(status === "online" ? "atlas.online" : "atlas.offline")}</span>}
            {observer?.lastStatusAt != null && (
              <span>
                {t("atlas.lastStatus")} <Timestamp value={observer.lastStatusAt} />
              </span>
            )}
            {radio && <span>{radio}</span>}
            {obs.loading && <span role="status">{t("common.loading")}</span>}
            {obs.failed && <span className="text-danger">{t("common.loadFailed")}</span>}
            <span className="whitespace-nowrap">
              <InfoTip text={[t("atlas.observerHelp"), obs.unsupported && t("atlas.observerUnsupported")]} />
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
