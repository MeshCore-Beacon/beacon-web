import { useTranslation } from "react-i18next";
import { Timestamp } from "../../components/Timestamp";
import { CopyButton } from "../../components/CopyButton";
import { formatBattery, formatRadioParts, formatUptime } from "../../lib/formatters";
import { useTick } from "../../hooks/useTick";
import type { Observer } from "./types";
import type { ObserverActivity, TelemetryPoint } from "../stats/types";

export function ObserverSummary({ observer, activity, points, pending = false }: { observer: Observer; activity?: ObserverActivity; points: TelemetryPoint[]; pending?: boolean }) {
  const { t, i18n } = useTranslation(); const now = useTick();
  const summary = activity?.summary;
  const statusFresh = observer.lastStatusAt != null && now - observer.lastStatusAt < 300_000;
  const lastArrival = Math.max(0, ...observer.brokers.map(b => b.lastPacketAt || 0));
  const trafficKnown = !!summary && lastArrival > 0;
  const trafficFresh = trafficKnown && now - lastArrival < 300_000;
  const stats = observer.statusMetadata?.stats;
  const reportedNoise = stats && typeof stats === "object" && "noise_floor" in stats && typeof stats.noise_floor === "number" && Number.isFinite(stats.noise_floor) ? stats.noise_floor : null;
  const noise = reportedNoise ?? points.at(-1)?.noiseFloorDb;
  const cards = [
    ["records", summary?.recordedPackets.toLocaleString() ?? "—"],
    ["lastHour", summary?.lastCompleteHour.toLocaleString() ?? "—"],
    ["lastPacket", summary?.latestRecordedAt != null ? <Timestamp value={summary.latestRecordedAt} /> : "—"],
    ["battery", observer.batteryLevel != null ? formatBattery(observer.batteryLevel) : "—"],
    ["uptime", observer.uptimeSeconds != null ? formatUptime(observer.uptimeSeconds) : "—"],
    ["noise", noise != null && Number.isFinite(noise) ? `${noise.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 })} dBm` : "—"],
  ] as const;
  return <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h1 className="break-words text-2xl font-semibold text-text-bright">{observer.displayName ?? observer.id.slice(0, 8)}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className={`rounded px-2 py-1 ${trafficFresh ? "bg-green/10 text-green" : "bg-bg-raised text-text-muted"}`}>{t(`observerPage.${!trafficKnown ? "trafficUnknown" : trafficFresh ? "trafficRecent" : "trafficQuiet"}`)}</span>
          <span className={`rounded px-2 py-1 ${statusFresh ? "bg-green/10 text-green" : "bg-warn/10 text-warn"}`}>{t(`observerPage.${observer.lastStatusAt == null ? "statusMissing" : statusFresh ? "statusRecent" : "statusStale"}`)}</span>
          <span className="rounded bg-primary/10 px-2 py-1 text-primary">{observer.iata}</span>
        </div>
      </div>
    </div>
    <ul role="list" aria-label={t("observerPage.metrics")} className="grid grid-cols-2 gap-3 xl:grid-cols-6">
      {cards.map(([key, value]) => <li key={key} className="min-w-0 rounded-lg border border-border bg-bg-surface p-3.5">
        <div className="text-xs font-medium text-text-muted">{t(`observerPage.${key}`)}</div>
        <div className="mt-2 break-words font-mono text-xl font-semibold tabular-nums text-text-bright">{value}</div>
        {key === "lastHour" && summary && <div className="mt-1 text-xs text-text-muted">{new Date(summary.lastCompleteHourStart).toISOString().slice(11, 16)}–{new Date(summary.lastCompleteHourEnd).toISOString().slice(11, 16)} UTC</div>}
        {key === "noise" && noise != null && <div className="mt-1 text-xs text-text-muted">{t(reportedNoise != null ? "observerPage.latestStatus" : "observerPage.latestTelemetry")}</div>}
      </li>)}
    </ul>
    {!summary && !pending && <p className="text-sm text-text-muted">{t("observerPage.summaryMissing")}</p>}
  </>;
}

export function ObserverDeviceDetails({ observer }: { observer: Observer }) {
  const { t } = useTranslation();
  const radio = formatRadioParts({ freqMhz: observer.radioFreqMhz, sf: observer.radioSf, bwKhz: observer.radioBwKhz, cr: observer.radioCr });
  return <details className="rounded-lg border border-border bg-bg-surface p-4">
    <summary className="cursor-pointer text-sm font-semibold text-text-normal">{t("observerPage.details")}</summary>
    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      {([ ["model", observer.hardwareModel], ["firmware", observer.firmwareVersion], ["client", observer.softwareVersion], ["radio", radio] ] as const).map(([key, value]) => <div key={key}><dt className="text-text-muted">{t(`observerPage.${key}`)}</dt><dd className="break-words text-text-normal">{value ?? "—"}</dd></div>)}
      <div className="min-w-0 sm:col-span-2"><dt className="text-text-muted">{t("observerPage.publicKey")}</dt><dd className="flex items-center gap-2"><code className="min-w-0 break-all text-xs">{observer.publicKey}</code><CopyButton value={observer.publicKey} label={t("observerPage.copy")} copiedLabel={t("observerPage.copied")} /></dd></div>
      <div><dt className="text-text-muted">{t("observerPage.firstSeen")}</dt><dd><Timestamp value={observer.firstSeen} /></dd></div>
    </dl>
    <ul className="mt-4 space-y-2 text-sm">{observer.brokers.map(b => <li key={b.name} className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2"><strong>{b.name}</strong><span>{t("observerPage.presence")}: <Timestamp value={b.lastSeenAt} /></span><span>{t("observerPage.packetArrival")}: {b.lastPacketAt > 0 ? <Timestamp value={b.lastPacketAt} /> : "—"}</span></li>)}</ul>
  </details>;
}
