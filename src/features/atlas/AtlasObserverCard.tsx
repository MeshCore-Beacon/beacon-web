import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getObserverActivity, getObserverTelemetry, isNotFound } from "../../api/client";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { Badge } from "../../components/Badge";
import { InfoTip } from "../../components/InfoTip";
import { Timestamp } from "../../components/Timestamp";
import { useRateLimit } from "../../hooks/useRateLimit";
import { useTick } from "../../hooks/useTick";
import { formatBattery, formatCount, formatUptime } from "../../lib/formatters";
import { observerNoiseFloor } from "../observers/observer-stats";
import { deriveObserverStatus } from "../observers/observer-status";
import { Card, StatCard } from "../stats/cards";
import { useChartColors } from "../stats/chartTheme";
import type { AtlasPin, AtlasRange } from "./atlas-storage";
import { finite, latest, loadAtlasObserver, observerActivitySeries, observerTelemetrySeries } from "./observer";
import type { ReactNode } from "react";

export function AtlasObserverCard({ pin, range, active, onRemove, onResolved, onViewObserver, reorder }: {
  pin: AtlasPin; range: AtlasRange; active: boolean; onRemove: () => void;
  onResolved: (id: string) => void; onViewObserver: (id: string) => void; reorder?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const colors = useChartColors();
  const now = useTick(60_000);
  const limitedUntil = useRateLimit();
  const enabled = active && !(limitedUntil != null && now < limitedUntil);
  const polling = { staleTime: 60_000, refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: false, retry: false } as const;
  const observer = useQuery({ ...polling, queryKey: ["atlas-observer", pin.publicKey || pin.id], queryFn: ({ signal }) => loadAtlasObserver(pin, signal), enabled });
  const data = observer.data;
  const identityReady = enabled && !!data && !observer.isError;
  const duration = range === "3d" ? "72h" : "24h";
  const activity = useQuery({ ...polling, queryKey: ["atlas-observer-activity", data?.id, range], queryFn: ({ signal }) => getObserverActivity(data!.id, duration, "1h", undefined, signal), enabled: identityReady });
  const telemetry = useQuery({ ...polling, queryKey: ["atlas-observer-telemetry", data?.id, range], queryFn: ({ signal }) => getObserverTelemetry(data!.id, duration, "1h", undefined, signal), enabled: identityReady });
  useEffect(() => { if (data && data.id !== pin.id) onResolved(data.id); }, [data, pin.id, onResolved]);
  const points = observerTelemetrySeries(telemetry.data?.points ?? [], range, now);
  const heard = observerActivitySeries(activity.data, range, now);
  const counts = heard.map(p => finite(p.observations) ? p.observations : null);
  const count = counts.some(finite) ? counts.reduce<number>((total, n) => total + (n ?? 0), 0) : null;
  const snr = heard.map(p => finite(p.snrAvg) ? p.snrAvg : null);
  const rssi = heard.map(p => finite(p.rssiAvg) ? p.rssiAvg : null);
  const battery = finite(data?.batteryLevel) ? data.batteryLevel : latest(points.batteryMv) == null ? null : latest(points.batteryMv)! / 1000;
  const uptime = finite(data?.uptimeSeconds) ? data.uptimeSeconds : latest(points.uptimeSeconds);
  const noise = data ? observerNoiseFloor(data) ?? latest(points.noiseFloorDb) : null;
  const measure = (value: number | null, unit: string) => value == null ? "—" : `${value.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 })} ${unit}`;
  const failed = observer.isError || activity.isError || telemetry.isError;
  const retry = () => { void observer.refetch(); if (data && !observer.isError) { void activity.refetch(); void telemetry.refetch(); } };
  const name = data?.displayName || pin.name || pin.id.slice(0, 8);
  return <Card className="flex h-full flex-col" wrap title={<span className="flex min-w-0 flex-wrap items-center gap-2">
    <button type="button" disabled={!data || observer.isError} className="max-w-full truncate text-primary normal-case hover:underline disabled:text-text-muted" onClick={() => data && onViewObserver(data.id)}>{name}</button>
    <Badge variant="default"><span className="inline-flex items-center gap-1 text-primary"><span aria-hidden className="drop-shadow-[0_0_4px_currentColor]">◉</span>{t("atlas.observerCard")}</span></Badge>
    {data && <Badge variant={deriveObserverStatus(data, now) === "online" ? "live" : "stale"}>{t(deriveObserverStatus(data, now) === "online" ? "atlas.recent" : "atlas.stale")}</Badge>}
  </span>} right={<div className="ml-auto flex items-center gap-1"><button type="button" className={ACTION_BUTTON_CLASS} onClick={onRemove}>{t("atlas.remove")}</button>{reorder}</div>}>
    {observer.isPending && <p role="status" className="text-sm text-text-muted">{t("common.loading")}</p>}
    {failed && <p role="alert" className="mb-2 text-xs text-warn">{t(observer.isError && isNotFound(observer.error) ? "atlas.observerMissing" : "atlas.observerPartial")} <button type="button" className={ACTION_BUTTON_CLASS} onClick={retry}>{t("observerPage.retry")}</button></p>}
    {data && <>
      <div className="grid flex-1 grid-cols-2 gap-3">
        <StatCard compact label={t("atlas.observerReports")} value={formatCount(count)} spark={counts} interpolateGaps={false} accent={colors.series[0]!} sublabel={t(counts.some(v => v == null) ? "atlas.observerPartialCoverage" : `atlas.ranges.${range}`)} />
        <StatCard compact label={t("observerPage.battery")} value={battery == null ? "—" : formatBattery(battery)} spark={points.batteryMv.map(v => v == null ? null : v / 1000)} accent={colors.series[2]!} interpolateGaps />
        <StatCard compact label={t("observerPage.uptime")} value={uptime == null ? "—" : formatUptime(uptime)} spark={points.uptimeSeconds} interpolateGaps={false} accent={colors.series[3]!} />
        <StatCard compact label={t("observerPage.noise")} value={measure(noise, "dBm")} spark={points.noiseFloorDb} accent={colors.series[1]!} interpolateGaps />
        <StatCard compact label={t("atlas.observerSnr")} value={measure(latest(snr), "dB")} spark={snr} accent={colors.series[2]!} interpolateGaps />
        <StatCard compact label={t("atlas.observerRssi")} value={measure(latest(rssi), "dBm")} spark={rssi} accent={colors.series[1]!} interpolateGaps />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-text-muted">
        <span>{t("atlas.lastSeen")} {data.lastSeen > 0 ? <Timestamp value={data.lastSeen} /> : "—"}</span>
        <InfoTip text={t("atlas.observerHistoryHelp")} />
      </div>
    </>}
  </Card>;
}
