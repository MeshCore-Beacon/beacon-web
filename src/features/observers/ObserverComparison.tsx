import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { InfoTip } from "../../components/InfoTip";
import { getObserverComparison } from "../../api/client";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { formatBattery, formatUptime } from "../../lib/formatters";
import { ObserverPicker } from "./ObserverPicker";
import { observerNoiseFloor } from "./observer-stats";
import { OBSERVER_UUID } from "./observer-id";
import { Card, ChartCard } from "../stats/cards";
import { activityParamsFor, useObserver, useObserverActivity } from "../stats/useTelemetry";
import { useChartColors } from "../stats/chartTheme";
import { heardOption } from "../stats/chartOptions";
import { fillActivity, intervalToMs } from "../stats/transforms";
import { RANGE_MS, type ObserverActivity, type StatsRange } from "../stats/types";
import type { Observer } from "./types";

function statusNoise(observer: Observer) {
  const n = observerNoiseFloor(observer);
  return n == null ? "—" : `${n} dBm`;
}

export function ObserverComparison({ observerA, activityA, range, observerBId, until, onSelect, onRefresh }: {
  observerA: Observer; activityA?: ObserverActivity; range: StatsRange; observerBId: string; until: number | null;
  onSelect: (id: string) => void; onRefresh: () => number;
}) {
  const { t, i18n } = useTranslation(); const colors = useChartColors();
  const valid = until != null && OBSERVER_UUID.test(observerA.id) && OBSERVER_UUID.test(observerBId) && observerA.id.toLowerCase() !== observerBId.toLowerCase();
  const b = useObserver(valid ? observerBId : null);
  const activityB = useObserverActivity(valid ? observerBId : null, range, until ?? undefined);
  const dataB = activityB.isError ? undefined : activityB.data;
  const intervalMs = intervalToMs(activityParamsFor(range).interval)!;
  const end = until == null ? 0 : Math.floor(until / intervalMs) * intervalMs;
  const start = end - RANGE_MS[range];
  // raw packets only outlive 24h/7d windows; at 30d the overlap would silently cover a few days
  const overlapRange = range !== "30d";
  const aligned = [activityA, dataB].every(data => data?.summary && data.windowStart === start && data.windowEnd === end && intervalToMs(data.interval) === intervalMs);
  const overlap = useQuery({
    queryKey: ["observer-dashboard-overlap", observerA.id, observerBId, start, end],
    queryFn: ({ signal }) => getObserverComparison(undefined, { observerA: observerA.id, observerB: observerBId, since: start, until: end }, signal),
    enabled: overlapRange && valid && aligned && !!b.data && !b.isError,
    staleTime: 30_000, refetchInterval: false, refetchOnWindowFocus: false, retry: false,
  });
  const option = useMemo(() => {
    const window = { start, end };
    const aPoints = activityA && aligned ? fillActivity(activityA.points, intervalMs, window, activityA) : [];
    const bPoints = dataB && aligned ? fillActivity(dataB.points, intervalMs, window, dataB) : [];
    return { ...heardOption(aPoints, colors, window), grid: { left: 48, right: 14, top: 32, bottom: 22 },
      legend: { data: ["A", "B"], top: 0, textStyle: { color: colors.textNormal } },
      series: [["A", aPoints, colors.series[0]], ["B", bPoints, colors.series[1]]].map(([name, points, color]) => ({
        name: name as string, type: "line" as const, symbol: "none", connectNulls: false,
        data: (points as typeof aPoints).map(p => [p.t, p.observations]),
        lineStyle: { width: 2, color: color as string }, itemStyle: { color: color as string },
      })),
    };
  }, [activityA, dataB, aligned, intervalMs, start, end, colors]);
  const date = (value: number | null | undefined) => value == null ? "—" : new Date(value).toLocaleString(i18n.resolvedLanguage, { timeZone: "UTC", dateStyle: "short", timeStyle: "short" });
  const groups = overlap.data && !overlap.isError ? [
    { label: t("observerCompare.onlyA"), count: overlap.data.onlyA, color: colors.series[0] },
    { label: t("observerCompare.both"), count: overlap.data.both, color: colors.green },
    { label: t("observerCompare.onlyB"), count: overlap.data.onlyB, color: colors.series[1] },
  ] : [];
  const refresh = () => {
    const nextUntil = onRefresh();
    if (valid) {
      void b.refetch();
      if (nextUntil === until) {
        void activityB.refetch();
        if (aligned && overlapRange) void overlap.refetch();
      }
    }
  };
  const rows = aligned && b.data ? [
    [t("observerPage.records"), activityA!.summary!.recordedPackets.toLocaleString(i18n.resolvedLanguage), dataB!.summary!.recordedPackets.toLocaleString(i18n.resolvedLanguage)],
    [t("observerPage.packetsLastHour"), `${activityA!.summary!.lastCompleteHour.toLocaleString(i18n.resolvedLanguage)} (${date(activityA!.summary!.lastCompleteHourStart)})`, `${dataB!.summary!.lastCompleteHour.toLocaleString(i18n.resolvedLanguage)} (${date(dataB!.summary!.lastCompleteHourStart)})`],
    [t("observerPage.lastPacket"), date(activityA!.summary!.latestRecordedAt), date(dataB!.summary!.latestRecordedAt)],
    [t("observerPage.battery"), observerA.batteryLevel == null ? "—" : formatBattery(observerA.batteryLevel), b.data.batteryLevel == null ? "—" : formatBattery(b.data.batteryLevel)],
    [t("observerPage.uptime"), observerA.uptimeSeconds == null ? "—" : formatUptime(observerA.uptimeSeconds), b.data.uptimeSeconds == null ? "—" : formatUptime(b.data.uptimeSeconds)],
    [t("observerPage.noise"), statusNoise(observerA), statusNoise(b.data)],
  ] : [];
  return <section aria-label={t("observerCompare.title")} className="space-y-4 rounded-lg border border-primary-dim p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-text-bright">{t("observerCompare.title")}</h2>
      <button type="button" className={ACTION_BUTTON_CLASS} onClick={refresh}>{t("observerCompare.refresh")}</button></div>
    <p className="break-words text-sm text-text-normal">A: {observerA.displayName ?? observerA.id} {b.data && <>· B: {b.data.displayName ?? b.data.id}</>}</p>
    <ObserverPicker id={observerBId} name={b.data?.displayName ?? t("observerCompare.choose")} excludeId={observerA.id} label={t("observerCompare.partner")} onSelect={onSelect} />
    {until == null ? <p role="alert">{t("observerCompare.invalidTime")}</p> : !valid ? <p role={observerBId ? "alert" : "status"}>{t(observerBId ? "observerCompare.invalidObserver" : "observerCompare.choose")}</p> : b.isError || activityB.isError ? <p role="alert">{t("observerPage.loadFailed")}</p> : !activityA || activityB.isPending || b.isPending ? <p role="status">{t("common.loading")}</p> : !aligned ? <p role="status">{t("observerCompare.unavailable")}</p> : <>
      <p className="flex flex-wrap items-center gap-2 text-xs text-text-muted">{t("observerPage.window")}: {date(start)} – {date(end)}<InfoTip text={t("observerCompare.currentNote")} /></p>
      <div className="overflow-x-auto"><table aria-label={t("observerCompare.metrics")} className="w-full text-left text-sm tabular-nums"><thead><tr><th className="p-2">{t("observerCompare.metric")}</th><th className="p-2">A</th><th className="p-2">B</th></tr></thead><tbody>{rows.map(([label, a, bValue]) => <tr className="border-t border-border" key={label}><th scope="row" className="p-2 font-normal text-text-muted">{label}</th><td className="p-2">{a}</td><td className="p-2">{bValue}</td></tr>)}</tbody></table></div>
      <ChartCard title={t("observerCompare.activity")} option={option} height={240} />
      {!overlapRange ? <p className="text-xs text-text-muted">{t("observerCompare.overlapShortRanges")}</p> : <Card title={t("observerCompare.overlap")} right={<InfoTip text={[t("observerCompare.retention"), t("observerCompare.definition")]} />}>
        {overlap.isError ? <p role="alert">{t("common.loadFailed")}</p> : !overlap.data ? <p role="status">{t("common.loading")}</p> : <>
          <p className="mb-3 text-lg font-semibold">{t("observerCompare.total", { count: overlap.data.totalPackets })}</p>
          {overlap.data.totalPackets === 0 ? <p>{t("observerCompare.empty")}</p> : <div aria-hidden className="mb-3 flex h-5 overflow-hidden rounded">{groups.map(g => <div key={g.label} style={{ width: `${g.count / overlap.data!.totalPackets * 100}%`, background: g.color }} />)}</div>}
          <dl className="grid grid-cols-3 gap-2 text-sm">{groups.map(g => <div key={g.label}><dt className="text-text-muted">{g.label}</dt><dd className="text-lg font-semibold" style={{ color: g.color }}>{g.count.toLocaleString(i18n.resolvedLanguage)}</dd></div>)}</dl>
        </>}
      </Card>}
    </>}
  </section>;
}
