import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Timestamp } from "../../components/Timestamp";
import { CopyButton } from "../../components/CopyButton";
import { formatAbsolute, formatBattery, formatRadioParts, formatUptime, formatUtc, timeAgoParts } from "../../lib/formatters";
import { useTick } from "../../hooks/useTick";
import { observerNoiseFloor } from "./observer-stats";
import { Tooltip } from "../../components/Tooltip";
import { IataChip } from "../../components/IataChip";
import type { Observer } from "./types";
import type { ObserverActivity, TelemetryPoint } from "../stats/types";

// Numbers at full size, units and words smaller, so "30d 16h 52m" and "-119 dBm" scan as values.
function Measure({ text }: { text: string }) {
  if (!/\d/.test(text)) return <>{text}</>;
  return <>{text.split(/(-?[\d.,]+)/).filter(Boolean).map((part, i) =>
    /\d/.test(part) ? <span key={i}>{part}</span> : <span key={i} className="text-sm font-semibold text-text-muted">{part}</span>)}</>;
}

export function ObserverSummary({ observer, activity, points, pending = false, actions }: { observer: Observer; activity?: ObserverActivity; points: TelemetryPoint[]; pending?: boolean; actions?: ReactNode }) {
  const { t, i18n } = useTranslation(); const now = useTick();
  const summary = activity?.summary;
  const statusFresh = observer.lastStatusAt != null && now - observer.lastStatusAt < 300_000;
  const reportedNoise = observerNoiseFloor(observer);
  const noise = reportedNoise ?? points.at(-1)?.noiseFloorDb;
  const ago = (at: number) => {
    const { count, unit } = timeAgoParts(at);
    return t("timestamp.ago", { duration: t(`timestamp.unit.${unit}`, { count }) });
  };
  const headingId = useId();
  const radio = formatRadioParts({ freqMhz: observer.radioFreqMhz, sf: observer.radioSf, bwKhz: observer.radioBwKhz, cr: observer.radioCr });
  const client = observer.softwareVersion && !(observer.firmwareVersion && observer.softwareVersion.includes(observer.firmwareVersion)) ? observer.softwareVersion : null;
  const device = ([
    [t("observerPage.model"), observer.hardwareModel],
    [t("observerPage.firmware"), observer.firmwareVersion],
    [t("observerPage.client"), client],
    [t("observerPage.radio"), radio],
  ] as const).filter((item): item is readonly [string, string] => !!item[1]);
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
    <section aria-labelledby={headingId} className="flex flex-col gap-2 rounded-lg border border-border bg-bg-surface px-3.5 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <h1 id={headingId} className="min-w-0 break-words text-lg font-semibold text-text-bright">{observer.displayName ?? observer.id.slice(0, 8)}</h1>
        <span role="img" aria-label={t(`observerPage.${observer.lastStatusAt == null ? "statusMissing" : statusFresh ? "statusRecent" : "statusStale"}`)} title={t(`observerPage.${observer.lastStatusAt == null ? "statusMissing" : statusFresh ? "statusRecent" : "statusStale"}`)} className={`inline-flex items-center ${observer.lastStatusAt == null ? "text-text-muted" : statusFresh ? "text-green" : "text-warn"}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" />{statusFresh ? <path d="m7 12 3 3 7-7" /> : <><path d="M12 7v6" /><circle cx="12" cy="17" r=".5" fill="currentColor" /></>}</svg>
        </span>
        <IataChip>{observer.iata}</IataChip>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {device.length > 0 && (
        <div className="flex flex-wrap gap-1.5 font-mono text-[12px] text-text-normal">
          {device.map(([label, value]) => <Tooltip key={label} label={label}><span className="rounded-sm bg-bg-raised px-1.5 py-0.5">{value}</span></Tooltip>)}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-text-muted">
        {observer.publicKey && <span className="inline-flex items-center gap-2">
          <Tooltip label={observer.publicKey}><code className="text-text-normal">{observer.publicKey.slice(0, 8)}…{observer.publicKey.slice(-7)}</code></Tooltip>
          <CopyButton value={observer.publicKey} label={t("observerPage.copy")} copiedLabel={t("observerPage.copied")} ariaLabel={t("observerPage.copyKey")} />
        </span>}
        {(observer.brokers ?? []).map((b) => (
          <Tooltip key={b.name} label={`${t("observerPage.packetArrival")}: ${b.lastPacketAt > 0 ? ago(b.lastPacketAt) : "—"}`}>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${now - b.lastSeenAt < 300_000 ? "bg-green" : "bg-warn"}`} />
              <span className="text-text-normal">{b.name}</span>
              <Timestamp value={b.lastSeenAt} />
            </span>
          </Tooltip>
        ))}
        <span>{t("observerPage.firstSeen")} {observer.firstSeen ? <Timestamp value={observer.firstSeen} className="text-text-normal" /> : "—"}</span>
      </div>
    </section>
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
