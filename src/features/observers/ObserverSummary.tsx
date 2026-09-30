import { useTranslation } from "react-i18next";
import { Timestamp } from "../../components/Timestamp";
import { CopyButton } from "../../components/CopyButton";
import { formatAbsolute, formatBattery, formatRadioParts, formatUptime, formatUtc, timeAgoParts } from "../../lib/formatters";
import { useTick } from "../../hooks/useTick";
import { observerNoiseFloor } from "./observer-stats";
import { Card } from "../stats/cards";
import { Tooltip } from "../../components/Tooltip";
import { Field } from "../../components/DetailPanel";
import { IataChip } from "../../components/IataChip";
import type { Observer } from "./types";
import type { ObserverActivity, TelemetryPoint } from "../stats/types";

// Numbers at full size, units and words smaller, so "30d 16h 52m" and "-119 dBm" scan as values.
function Measure({ text }: { text: string }) {
  if (!/\d/.test(text)) return <>{text}</>;
  return <>{text.split(/(-?[\d.,]+)/).filter(Boolean).map((part, i) =>
    /\d/.test(part) ? <span key={i}>{part}</span> : <span key={i} className="text-sm font-semibold text-text-muted">{part}</span>)}</>;
}

export function ObserverSummary({ observer, activity, points, pending = false }: { observer: Observer; activity?: ObserverActivity; points: TelemetryPoint[]; pending?: boolean }) {
  const { t, i18n } = useTranslation(); const now = useTick();
  const summary = activity?.summary;
  const statusFresh = observer.lastStatusAt != null && now - observer.lastStatusAt < 300_000;
  const reportedNoise = observerNoiseFloor(observer);
  const noise = reportedNoise ?? points.at(-1)?.noiseFloorDb;
  const ago = (at: number) => {
    const { count, unit } = timeAgoParts(at);
    return t("timestamp.ago", { duration: t(`timestamp.unit.${unit}`, { count }) });
  };
  const hour = (at: number) => formatUtc(at, { timeOnly: true }).slice(0, 2);
  const cards: { key: string; label: string; value: string; title?: string }[] = [
    { key: "records", label: t("observerPage.records"), value: summary?.recordedPackets.toLocaleString(i18n.resolvedLanguage) ?? "—" },
    {
      key: "lastHour",
      label: summary ? t("observerPage.hourWindow", { start: hour(summary.lastCompleteHourStart), end: hour(summary.lastCompleteHourEnd) }) : t("observerPage.lastHour"),
      value: summary?.lastCompleteHour.toLocaleString(i18n.resolvedLanguage) ?? "—",
    },
    {
      key: "lastPacket",
      label: t("observerPage.lastPacket"),
      value: summary?.latestRecordedAt != null ? ago(summary.latestRecordedAt) : "—",
      title: summary?.latestRecordedAt != null ? formatAbsolute(summary.latestRecordedAt) : undefined,
    },
    { key: "battery", label: t("observerPage.battery"), value: observer.batteryLevel != null ? formatBattery(observer.batteryLevel) : "—" },
    { key: "uptime", label: t("observerPage.uptime"), value: observer.uptimeSeconds != null ? formatUptime(observer.uptimeSeconds) : "—" },
    {
      key: "noise",
      label: t("observerPage.lastNoise"),
      value: noise != null && Number.isFinite(noise) ? `${noise.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 })} dBm` : "—",
    },
  ];
  return <>
    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
      <h1 className="min-w-0 break-words text-lg font-semibold text-text-bright">{observer.displayName ?? observer.id.slice(0, 8)}</h1>
      <span role="img" aria-label={t(`observerPage.${observer.lastStatusAt == null ? "statusMissing" : statusFresh ? "statusRecent" : "statusStale"}`)} title={t(`observerPage.${observer.lastStatusAt == null ? "statusMissing" : statusFresh ? "statusRecent" : "statusStale"}`)} className={`inline-flex items-center ${observer.lastStatusAt == null ? "text-text-muted" : statusFresh ? "text-green" : "text-warn"}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" />{statusFresh ? <path d="m7 12 3 3 7-7" /> : <><path d="M12 7v6" /><circle cx="12" cy="17" r=".5" fill="currentColor" /></>}</svg>
      </span>
      <IataChip>{observer.iata}</IataChip>
    </div>
    <ul role="list" aria-label={t("observerPage.metrics")} className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      {cards.map(({ key, label, value, title }) => {
        const shown = <span className="font-mono text-xl font-bold tabular-nums text-text-bright sm:text-2xl"><Measure text={value} /></span>;
        return <li key={key} className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-bg-surface px-2 py-3 text-center">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
          {title ? <Tooltip label={title}>{shown}</Tooltip> : shown}
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
