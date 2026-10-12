import { useEffect, useMemo } from "react";
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
  onMove: (direction: -1 | 1) => void;
  onResolved: (id: string) => void;
  first: boolean;
  last: boolean;
}

// One pinned node, laid out as the Signal tab's KPI row so Atlas and Analytics read the same way.
export function AtlasCard({
  pin,
  range,
  active,
  heardOpen,
  onHeardToggle,
  onRemove,
  onMove,
  onResolved,
  first,
  last,
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
      {node?.stale === false && <Badge variant="live">{t("observerPage.statusRecent")}</Badge>}
      {node?.stale === true && <Badge variant="stale">{t("observerPage.statusStale")}</Badge>}
    </span>
  );

  const actions = (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={ACTION_BUTTON_CLASS}
        aria-expanded={heardOpen}
        disabled={!node}
        onClick={onHeardToggle}
      >
        {t("atlas.heardBy")}
      </button>
      <button
        type="button"
        className={ACTION_BUTTON_CLASS}
        aria-label={t("atlas.moveEarlier")}
        disabled={first}
        onClick={() => onMove(-1)}
      >
        ◀
      </button>
      <button
        type="button"
        className={ACTION_BUTTON_CLASS}
        aria-label={t("atlas.moveLater")}
        disabled={last}
        onClick={() => onMove(1)}
      >
        ▶
      </button>
      <button type="button" className={ACTION_BUTTON_CLASS} onClick={onRemove}>
        {t("atlas.remove")}
      </button>
    </div>
  );

  return (
    <Card title={title} right={actions} wrap>
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
      {node && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label={t("signal.receptions")}
              value={formatCount(sample.reports.length)}
              accent={c.primary}
              spark={sample.counts}
              markPeak
              sublabel={capped ? t("atlas.sampleCapped", { limit: REPORT_LIMIT }) : t(`atlas.ranges.${range}`)}
            />
            <StatCard
              label={t("signal.meanSnr")}
              value={average(sample.snr, "dB")}
              accent={c.secondary}
              spark={sample.snrHourly}
            />
            <StatCard
              label={t("signal.meanRssi")}
              value={average(sample.rssi, "dBm")}
              accent={c.green}
              spark={sample.rssiHourly}
            />
            <StatCard
              label={t("signal.hoursWithRecords")}
              value={`${activeHours}/${hours}`}
              accent={c.warn}
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
            <span>{t("nodeDetail.neighborsCount", { count: node.knownNeighborCount })}</span>
            <InfoTip text={[t("atlas.sampleHelp", { limit: REPORT_LIMIT }), capped && t("atlas.cappedHelp")]} />
          </div>
          {heardOpen && (
            <div className="border-t border-border-subtle pt-2 font-mono text-xs">
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
                  <ul className="max-h-44 overflow-y-auto">
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
                    className={`${ACTION_BUTTON_CLASS} mt-2`}
                    onClick={() => onAnalyzePacket(latest.packetHash, latest.id)}
                  >
                    {t("atlas.openPacket")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
