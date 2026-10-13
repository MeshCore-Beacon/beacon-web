import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isNotFound } from "../../api/client";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { Badge } from "../../components/Badge";
import { IataChip } from "../../components/IataChip";
import { InfoTip } from "../../components/InfoTip";
import { Timestamp } from "../../components/Timestamp";
import { formatCount, formatHex } from "../../lib/formatters";
import type { Observation } from "../../types/api";
import { usePacketDetail } from "../packets/usePacketDetail";
import { Card, StatCard } from "../stats/cards";
import { useChartColors } from "../stats/chartTheme";
import { average } from "../stats/signal";
import { REPORT_LIMIT, type AtlasPin, type AtlasRange } from "./atlas";
import { useAtlasNode } from "./useAtlas";
import type { CardHandleProps } from "./useCardDrag";

export interface AtlasActions {
  onViewNode: (id: string) => void;
  onViewObserver: (id: string) => void;
  onAnalyzePacket: (hash: string, observationId?: number) => void;
}

interface AtlasCardProps extends AtlasActions {
  pin: AtlasPin;
  range: AtlasRange;
  active: boolean;
  heardOpen: boolean;
  onHeardToggle: () => void;
  onRemove: () => void;
  onResolved: (id: string) => void;
  handle: Partial<CardHandleProps>;
}

// One pinned node, laid out as the Signal tab's KPI row so Atlas and Analytics read the same way.
export function AtlasCard({
  pin,
  range,
  active,
  heardOpen,
  onHeardToggle,
  onRemove,
  onResolved,
  handle,
  onViewNode,
  onViewObserver,
  onAnalyzePacket,
}: AtlasCardProps) {
  const { t } = useTranslation();
  const c = useChartColors();
  const { query, node, sample, capped } = useAtlasNode(pin, range, active);
  const latest = sample.reports[0];
  const heard = usePacketDetail(heardOpen && latest ? latest.packetHash : null);
  const detail = heard.data;
  // Never show another node's observers if the packet record resolved to a different origin.
  const sameOrigin = !detail?.originPubkey || detail.originPubkey.toLowerCase() === pin.publicKey;
  const observers = useMemo(() => {
    if (!detail || !sameOrigin) return [];
    const latestByObserver = new Map<string, Observation>();
    for (const row of detail.observations) {
      const previous = latestByObserver.get(row.observerId);
      if (!previous || row.heardAt > previous.heardAt) latestByObserver.set(row.observerId, row);
    }
    return [...latestByObserver.values()].sort((a, b) => b.heardAt - a.heardAt);
  }, [detail, sameOrigin]);

  // A pin recovered under a new server ID is saved back so the next poll skips the key lookup.
  useEffect(() => {
    if (node && node.id !== pin.id) onResolved(node.id);
  }, [node, pin.id, onResolved]);

  const name = node?.name || pin.name;
  const hours = sample.counts.length;
  const activeHours = sample.present.filter(Boolean).length;

  // The list view is fixed to the tiles' height and scrolls inside it, so flipping never resizes the card.
  const body = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<number>();
  const toggleHeard = () => {
    if (!heardOpen) setHeld(body.current?.offsetHeight);
    onHeardToggle();
  };

  const title = (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={!node}
        onClick={() => node && onViewNode(node.id)}
        className={`min-w-0 max-w-full truncate normal-case disabled:text-text-muted disabled:no-underline ${
          name ? "text-primary hover:underline" : "italic text-text-dim"
        }`}
      >
        {name || formatHex(node?.id ?? pin.id)}
      </button>
      {node && <Badge variant="default">{node.nodeTypeName}</Badge>}
      {node?.stale === false && <Badge variant="live">{t("atlas.recent")}</Badge>}
      {node?.stale === true && <Badge variant="stale">{t("atlas.stale")}</Badge>}
    </span>
  );

  // Both toggle labels share one grid cell so the button is as wide as the longer one in either
  // state; otherwise flipping could push the actions under the title and grow the card.
  const labels = [t("atlas.heardBy"), t("tabs.Analytics")];
  const actions = (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={`${ACTION_BUTTON_CLASS} grid text-center`}
        aria-pressed={heardOpen}
        aria-label={labels[heardOpen ? 1 : 0]}
        disabled={!node}
        onClick={toggleHeard}
      >
        {labels.map((label, index) => {
          const shown = index === (heardOpen ? 1 : 0);
          return (
            <span key={label} aria-hidden={!shown || undefined} className={`col-start-1 row-start-1 ${shown ? "" : "invisible"}`}>
              {label}
            </span>
          );
        })}
      </button>
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

  return (
    <Card title={title} right={actions} wrap className="flex h-full flex-col">
      {query.isPending && <p role="status" className="text-sm text-text-muted">{t("common.loading")}</p>}
      {query.isError && isNotFound(query.error) && (
        <p role="alert" className="text-sm text-text-muted">{t("nodeDetail.notFound")}</p>
      )}
      {query.isError && !isNotFound(query.error) && (
        <p role="alert" className="text-sm text-danger">
          {t("common.loadFailed")}{" "}
          <button type="button" className={ACTION_BUTTON_CLASS} onClick={() => void query.refetch()}>
            {t("observerPage.retry")}
          </button>
        </p>
      )}
      {node && !heardOpen && (
        <div ref={body} className="flex flex-1 flex-col gap-3">
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
      {node && heardOpen && (
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
    </Card>
  );
}
