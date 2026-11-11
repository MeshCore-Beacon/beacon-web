import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isNotFound } from "../../api/client";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { Badge } from "../../components/Badge";
import { IataChip } from "../../components/IataChip";
import { InfoTip } from "../../components/InfoTip";
import { Timestamp } from "../../components/Timestamp";
import { Tooltip } from "../../components/Tooltip";
import { formatAbsolute, formatBattery, formatCount, formatHex, formatRadio, formatRadioParts, formatUptime } from "../../lib/formatters";
import type { Observation } from "../../types/api";
import type { NodeSummary } from "../nodes/types";
import { deriveObserverStatus } from "../observers/observer-status";
import { usePacketDetail } from "../packets/usePacketDetail";
import { Card, StatCard } from "../stats/cards";
import { useChartColors } from "../stats/chartTheme";
import { Segmented } from "../stats/Segmented";
import { average } from "../stats/signal";
import { DEFAULT_TILES, OBSERVER_TILES, resolveObserverNode, type AtlasPin, type AtlasRange, type AtlasView, type ObserverTile } from "./atlas";
import { TilePicker } from "./TilePicker";
import { ATLAS_REFRESH_MS, useAtlasNode } from "./useAtlas";
import type { PayloadShare } from "./observer-sample";
import { useAtlasObserver } from "./useAtlasObserver";
import type { CardHandleProps } from "./useCardDrag";

export type { AtlasView };

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
  home: AtlasView; // the view this card opens on
  onViewChange: (view: AtlasView) => void;
  onPinView: (view: AtlasView) => void;
  onRemove: () => void;
  onResolved: (id: string, observerId?: string) => void;
  onUpgrade: (node: NodeSummary, observerId: string) => void;
  onTilesChange: (tiles: readonly ObserverTile[]) => void;
  handle: Partial<CardHandleProps>;
}

const VIEW_LABEL: Record<AtlasView, string> = { analytics: "atlas.viewAnalytics", heard: "atlas.viewHeard", observer: "atlas.viewObserver" };

const TILE_LABEL: Record<ObserverTile, string> = {
  airtime: "atlas.airtime",
  battery: "atlas.battery",
  uptime: "atlas.uptime",
  types: "atlas.packetTypes",
  packets: "observerPage.records",
  snr: "signal.meanSnr",
  rssi: "signal.meanRssi",
  noise: "atlas.noiseFloor",
  queue: "observerPage.queue",
  errors: "observerPage.errors",
};
// Accents belong to the slot, so a card keeps its colours whatever its tiles show.
const SLOT_ACCENT = [0, 3, 2, 1];

// Icon-only header actions share one box so the row stays even.
const ICON_BOX = "flex h-[26px] w-7 shrink-0 items-center justify-center";
const ICON_BUTTON = `${ACTION_BUTTON_CLASS} ${ICON_BOX}`;
// Remove rests muted and only turns to danger under the pointer or focus, so it never reads as a primary action.
const REMOVE_BUTTON = `${ICON_BOX} rounded border border-border text-text-muted hover:bg-bg-raised hover:text-danger focus-visible:text-danger`;

const percent = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
const MIX_SLICES = 5;

// Share bar of the payload types heard, busiest first, with the top ones named underneath.
function TypeMix({ types, colors, unknown, other }: { types: PayloadShare[]; colors: string[]; unknown: string; other: string }) {
  const total = types.reduce((sum, p) => sum + p.count, 0);
  if (total === 0) return <div className="mt-1.5 h-[20px]" />;
  const named = types.map((p) => ({ ...p, name: p.name.toLowerCase() === "unknown" ? unknown : p.name.toLowerCase() }));
  const rest = named.slice(MIX_SLICES).reduce((sum, p) => sum + p.count, 0);
  const slices = [
    ...named.slice(0, MIX_SLICES).map((p, i) => ({ ...p, color: colors[i % colors.length]! })),
    ...(rest ? [{ name: other, count: rest, color: "var(--color-text-dim)" }] : []),
  ];
  const share = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="mt-1.5 flex h-[20px] flex-col justify-between">
      <div className="flex h-1.5 overflow-hidden rounded-full" aria-hidden>
        {slices.map((s) => (
          <span key={s.name} title={`${s.name} ${share(s.count)}`} style={{ width: `${(s.count / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      {/* one line: entries that don't fit wrap out of sight rather than cut mid-word */}
      <p className="flex h-[9px] flex-wrap gap-x-2 overflow-hidden font-mono text-[9px] leading-none text-text-muted">
        {slices.slice(0, 3).map((s) => (
          <span key={s.name} className="whitespace-nowrap">
            <span style={{ color: s.color }}>■</span> {s.name} {share(s.count)}
          </span>
        ))}
      </p>
    </div>
  );
}

// One pinned radio, laid out as the Signal tab's KPI row so Atlas and Analytics read the same way.
// A node that also observes gets a third view; an observer-only pin has just that view.
export function AtlasCard({
  pin,
  range,
  active,
  view,
  home,
  onViewChange,
  onPinView,
  onRemove,
  onResolved,
  onUpgrade,
  onTilesChange,
  handle,
  onViewNode,
  onViewObserver,
  onAnalyzePacket,
}: AtlasCardProps) {
  const { t } = useTranslation();
  const c = useChartColors();
  const nodePin = pin.kind === "node" ? pin : null;
  const { query, node, sample, activity } = useAtlasNode(nodePin, range, active);
  const observerId = pin.kind === "observer" ? pin.observerId : (node?.observerId ?? pin.observerId ?? null);
  const obs = useAtlasObserver(observerId, range, active, view === "observer", pin.kind === "observer");
  const observer = obs.observer.data;
  const views: AtlasView[] = pin.kind === "observer" ? ["observer"] : observerId ? ["analytics", "heard", "observer"] : ["analytics", "heard"];

  const latest = sample.latest;
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

  const compact = observer?.radio?.split(",").map(Number);
  const radioShort = observer && formatRadioParts(compact?.length === 3 && compact.every(Number.isFinite)
    ? { freqMhz: compact[0], sf: compact[2] }
    : { freqMhz: observer.radioFreqMhz, sf: observer.radioSf });

  // The list view is fixed to the tiles' height and scrolls inside it, so flipping never resizes the card.
  const body = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState<number>();
  const changeView = (next: AtlasView) => {
    if (view !== "heard") setHeld(body.current?.offsetHeight);
    onViewChange(next);
  };

  const title = (
    <span className="flex min-h-[26px] min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
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
    <span data-card-actions className="flex shrink-0 items-center gap-1 self-start">
      {views.length > 1 && (
        <Tooltip label={t(view === home ? "atlas.viewPinned" : "atlas.pinViewHelp")}>
          <button
            type="button"
            className={`${ICON_BUTTON} ${view === home ? "bg-primary/10" : ""}`}
            aria-label={t("atlas.pinView")}
            aria-pressed={view === home}
            onClick={() => view !== home && onPinView(view)}
          >
            <svg width="10" height="14" viewBox="0 0 10 14" fill={view === home ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
              <path d="M2.5 1h5v1.5l-1 1V7l2 2v1h-7V9l2-2V3.5l-1-1z" />
              <path d="M5 10v3.3" />
            </svg>
          </button>
        </Tooltip>
      )}
      <Tooltip label={t("atlas.remove")}>
        <button type="button" className={REMOVE_BUTTON} aria-label={t("atlas.remove")} onClick={onRemove}>
          <svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
            <path d="M1.5 3.5l7 7M8.5 3.5l-7 7" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip label={t("atlas.dragToReorder")} hideOnPress>
        <button
          type="button"
          className={`${ICON_BUTTON} cursor-grab touch-none active:cursor-grabbing`}
          aria-label={t("atlas.dragToReorder")}
          {...handle}
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
            <circle cx="2.5" cy="2" r="1.3" /><circle cx="7.5" cy="2" r="1.3" />
            <circle cx="2.5" cy="7" r="1.3" /><circle cx="7.5" cy="7" r="1.3" />
            <circle cx="2.5" cy="12" r="1.3" /><circle cx="7.5" cy="12" r="1.3" />
          </svg>
        </button>
      </Tooltip>
    </span>
  );

  // One line that never wraps: the right side gives way first, then the left, a failure never does,
  // and the tip carries every fact in full.
  const footer = (left: ReactNode, right: ReactNode, state: { loading: boolean; failed: boolean }, tip: (string | false | null | undefined)[]) => (
    <div data-card-footer className="flex items-center gap-3 whitespace-nowrap font-mono text-[11px] text-text-muted">
      {left}
      {state.failed ? <span className="shrink-0 text-danger">{t("common.loadFailed")}</span> : state.loading ? <span role="status" className="shrink-0">{t("common.loading")}</span> : null}
      <span className="ml-auto min-w-0 shrink-[999] truncate">{right}</span>
      <span className="flex shrink-0"><InfoTip text={tip} /></span>
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

  const tiles = pin.tiles ?? DEFAULT_TILES;
  // The battery tile stands in as uptime for a radio with no battery, so either tile can be showing it.
  const uptimeOnTile = tiles.includes("uptime") || (tiles.includes("battery") && obs.sample.battery === null);
  const statusLabel = status && t(status === "online" ? "atlas.online" : "atlas.offline");
  const meanHops = `${t("atlas.meanHops")} ${average(sample.hops)}`;
  const neighbors = node ? t("nodeDetail.neighborsCount", { count: node.knownNeighborCount }) : "";
  const free = OBSERVER_TILES.filter((id) => !tiles.includes(id)).map((id) => ({ value: id, label: t(TILE_LABEL[id]) }));
  const windowLabel = obs.sample.partial ? t("atlas.observerPartialCoverage") : t(`atlas.ranges.${range}`);
  const observerTile = (id: ObserverTile, slot: number) => {
    const sample = obs.sample;
    // Today's stand-in for a radio with no battery, unless the card already has an uptime tile.
    const shown = id === "battery" && sample.battery === null && !tiles.includes("uptime") ? "uptime" : id;
    const common = {
      compact: true,
      accent: c.series[SLOT_ACCENT[slot]!]!,
      label: (
        <TilePicker
          label={t(TILE_LABEL[shown])}
          options={free}
          up={slot >= 2}
          onPick={(next) => onTilesChange(tiles.map((old, i) => (i === slot ? (next as ObserverTile) : old)))}
          onReset={pin.tiles && (() => onTilesChange(DEFAULT_TILES))}
        />
      ),
    };
    switch (shown) {
      case "airtime":
        return (
          <StatCard
            {...common}
            value={sample.airtime === null ? dash : percent(sample.airtime)}
            spark={sample.airtimeHourly}
            markPeak
            interpolateGaps
            sublabel={
              sample.airtimeSource === "radio"
                ? `TX ${percent(sample.airtimeTx!)} · RX ${percent(sample.airtimeRx!)}`
                : sample.airtimeSource === "heard"
                  ? t("atlas.airtimeHeard")
                  : undefined
            }
          />
        );
      case "battery":
        return <StatCard {...common} value={sample.battery === null ? dash : formatBattery(sample.battery)} spark={sample.batteryHourly} interpolateGaps />;
      case "uptime":
        return <StatCard {...common} value={sample.uptime === null ? dash : formatUptime(sample.uptime)} spark={sample.uptimeHourly} />;
      case "types":
        return (
          <StatCard
            {...common}
            value={sample.heard === null ? dash : formatCount(sample.heard)}
            sublabel={windowLabel}
            visual={<TypeMix types={sample.types} colors={c.series} unknown={t("observerPage.unknown")} other={t("atlas.otherTypes")} />}
          />
        );
      case "packets":
        return <StatCard {...common} value={sample.heard === null ? dash : formatCount(sample.heard)} spark={sample.counts} markPeak sublabel={windowLabel} />;
      case "snr":
        return <StatCard {...common} value={average(sample.snr, "dB")} spark={sample.snrHourly} />;
      case "rssi":
        return <StatCard {...common} value={average(sample.rssi, "dBm")} spark={sample.rssiHourly} />;
      case "noise":
        return <StatCard {...common} value={sample.noise === null ? dash : `${Math.round(sample.noise)} dBm`} spark={sample.noiseHourly} interpolateGaps />;
      case "queue":
        return <StatCard {...common} value={sample.queue === null ? dash : formatCount(Math.round(sample.queue))} spark={sample.queueHourly} interpolateGaps />;
      case "errors":
        return <StatCard {...common} value={sample.errors === null ? dash : formatCount(sample.errors)} spark={sample.errorsHourly} markPeak />;
    }
  };

  return (
    <Card title={title} right={actions} className="flex h-full flex-col">
      {views.length > 1 && (
        <Segmented
          stretch
          size="xs"
          className="mb-3"
          ariaLabel={t("atlas.view")}
          value={view}
          onChange={(next) => changeView(next as AtlasView)}
          options={views.map((value) => ({ value, label: t(VIEW_LABEL[value]) }))}
        />
      )}
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
          <div className="grid flex-1 grid-cols-2 gap-3">
            <StatCard
              compact
              label={t("signal.receptions")}
              value={sample.total === null ? dash : formatCount(sample.total)}
              accent={c.series[0]!}
              spark={sample.counts}
              markPeak
              sublabel={sample.partial ? t("atlas.observerPartialCoverage") : t(`atlas.ranges.${range}`)}
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
          {footer(
            node.lastSeen > 0 && (
              <span className="min-w-0 truncate">
                <span>{t("atlas.lastSeen")}</span> <Timestamp value={node.lastSeen} />
              </span>
            ),
            `${meanHops} · ${neighbors}`,
            activity,
            [
              node.lastSeen > 0 && `${t("atlas.lastSeen")} ${formatAbsolute(node.lastSeen)}`,
              meanHops,
              neighbors,
              activity.unsupported && t("atlas.activityUnsupported"),
              t("atlas.sampleHelp"),
            ],
          )}
        </div>
      )}
      {view === "heard" && node && (
        <div className="flex flex-col overflow-hidden font-mono text-xs" style={{ height: held }}>
          {activity.loading ? (
            <p role="status" className="text-text-muted">{t("common.loading")}</p>
          ) : !latest ? (
            <p className="text-text-muted">{t(activity.unsupported ? "atlas.activityUnsupported" : activity.failed ? "common.loadFailed" : "atlas.noReports")}</p>
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
                onClick={() => onAnalyzePacket(latest.packetHash)}
              >
                {t("atlas.openPacket")}
              </button>
            </>
          )}
        </div>
      )}
      {view === "observer" && observerId && (pin.kind === "observer" ? observer : node) && (
        <div ref={body} className="flex flex-1 flex-col gap-3">
          <div className="grid flex-1 grid-cols-2 gap-3">{tiles.map((id, slot) => <Fragment key={id}>{observerTile(id, slot)}</Fragment>)}</div>
          {footer(
            (status || observer?.lastStatusAt != null) && (
              <span className="flex min-w-0 items-center gap-1.5">
                {status && <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === "online" ? "bg-green" : "bg-text-dim/30"}`} />}
                <span className="min-w-0 truncate">
                  {statusLabel && <span>{statusLabel}</span>}
                  {statusLabel && observer?.lastStatusAt != null && " · "}
                  {observer?.lastStatusAt != null && <Timestamp value={observer.lastStatusAt} />}
                </span>
              </span>
            ),
            radioShort ?? radio,
            obs,
            [
              [statusLabel, observer?.lastStatusAt != null && `${t("atlas.lastStatus")} ${formatAbsolute(observer.lastStatusAt)}`].filter(Boolean).join(" · "),
              radio,
              !uptimeOnTile && obs.sample.uptime !== null && `${t("atlas.uptime")} ${formatUptime(obs.sample.uptime)}`,
              obs.unsupported && t("atlas.observerUnsupported"),
              t("atlas.observerHelp"),
            ],
          )}
        </div>
      )}
    </Card>
  );
}
