import { useTranslation } from "react-i18next";
import { Timestamp } from "../../components/Timestamp";
import { CopyButton } from "../../components/CopyButton";
import { formatBattery, formatRadioParts, formatUptime, formatUtc } from "../../lib/formatters";
import { useTick } from "../../hooks/useTick";
import { observerNoiseFloor } from "./observer-stats";
import { Card, StatCard } from "../stats/cards";
import { Field } from "../../components/DetailPanel";
import { IataChip } from "../../components/IataChip";
import type { Observer } from "./types";
import type { ObserverActivity, TelemetryPoint } from "../stats/types";

export function ObserverSummary({ observer, activity, points, pending = false }: { observer: Observer; activity?: ObserverActivity; points: TelemetryPoint[]; pending?: boolean }) {
  const { t, i18n } = useTranslation(); const now = useTick();
  const summary = activity?.summary;
  const statusFresh = observer.lastStatusAt != null && now - observer.lastStatusAt < 300_000;
  const reportedNoise = observerNoiseFloor(observer);
  const noise = reportedNoise ?? points.at(-1)?.noiseFloorDb;
  const cards = [
    ["records", summary?.recordedPackets.toLocaleString(i18n.resolvedLanguage) ?? "—"],
    ["lastHour", summary?.lastCompleteHour.toLocaleString(i18n.resolvedLanguage) ?? "—"],
    ["lastPacket", summary?.latestRecordedAt != null ? <Timestamp value={summary.latestRecordedAt} /> : "—"],
    ["battery", observer.batteryLevel != null ? formatBattery(observer.batteryLevel) : "—"],
    ["uptime", observer.uptimeSeconds != null ? formatUptime(observer.uptimeSeconds) : "—"],
    ["noise", noise != null && Number.isFinite(noise) ? `${noise.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 })} dBm` : "—"],
  ] as const;
  return <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h1 className="break-words text-lg font-semibold text-text-bright">{observer.displayName ?? observer.id.slice(0, 8)}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span role="img" aria-label={t(`observerPage.${observer.lastStatusAt == null ? "statusMissing" : statusFresh ? "statusRecent" : "statusStale"}`)} title={t(`observerPage.${observer.lastStatusAt == null ? "statusMissing" : statusFresh ? "statusRecent" : "statusStale"}`)} className={`inline-flex items-center ${observer.lastStatusAt == null ? "text-text-muted" : statusFresh ? "text-green" : "text-warn"}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" />{statusFresh ? <path d="m7 12 3 3 7-7" /> : <><path d="M12 7v6" /><circle cx="12" cy="17" r=".5" fill="currentColor" /></>}</svg>
          </span>
          <IataChip>{observer.iata}</IataChip>
        </div>
      </div>
    </div>
    <ul role="list" aria-label={t("observerPage.metrics")} className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      {cards.map(([key, value]) => {
        const note = key === "lastHour" && summary ? `${formatUtc(summary.lastCompleteHourStart, { timeOnly: true })}–${formatUtc(summary.lastCompleteHourEnd, { timeOnly: true })} UTC`
          : key === "noise" && noise != null ? t(reportedNoise != null ? "observerPage.latestStatus" : "observerPage.latestTelemetry")
          : undefined;
        return <li key={key} className="min-w-0">
          <StatCard label={t(`observerPage.${key}`)} value={value} accent="var(--color-primary)" />
          <p className="mt-1 min-h-4 text-xs text-text-muted">{note}</p>
        </li>;
      })}
    </ul>
    {!summary && !pending && <p className="text-sm text-text-muted">{t("observerPage.summaryMissing")}</p>}
  </>;
}

export function ObserverDeviceDetails({ observer }: { observer: Observer }) {
  const { t } = useTranslation();
  const radio = formatRadioParts({ freqMhz: observer.radioFreqMhz, sf: observer.radioSf, bwKhz: observer.radioBwKhz, cr: observer.radioCr });
  return <Card title={t("observerPage.details")}>
    <div className="grid gap-x-4 gap-y-0.5 font-mono text-[13px] sm:grid-cols-2">
      {([ ["model", observer.hardwareModel], ["firmware", observer.firmwareVersion], ["client", observer.softwareVersion], ["radio", radio] ] as const).map(([key, value]) => <Field key={key} label={t(`observerPage.${key}`)} value={value ?? "—"} />)}
      <div className="min-w-0 sm:col-span-2"><Field label={t("observerPage.publicKey")} value={<span className="inline-flex items-center gap-2"><code className="min-w-0 break-all">{observer.publicKey}</code><CopyButton value={observer.publicKey} label={t("observerPage.copy")} copiedLabel={t("observerPage.copied")} /></span>} /></div>
      <Field label={t("observerPage.firstSeen")} value={<Timestamp value={observer.firstSeen} />} />
    </div>
    <ul className="mt-3 space-y-1.5 font-mono text-[11px]">{observer.brokers.map(b => <li key={b.name} className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border-subtle pt-1.5"><strong className="text-text-normal">{b.name}</strong><span>{t("observerPage.presence")}: <Timestamp value={b.lastSeenAt} /></span><span>{t("observerPage.packetArrival")}: {b.lastPacketAt > 0 ? <Timestamp value={b.lastPacketAt} /> : "—"}</span></li>)}</ul>
  </Card>;
}
