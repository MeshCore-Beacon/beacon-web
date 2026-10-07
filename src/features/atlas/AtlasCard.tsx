import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getPacketDetail } from "../../api/client";
import { Timestamp } from "../../components/Timestamp";
import { useTick } from "../../hooks/useTick";
import { loadAtlasNode, REPORT_LIMIT, summarizeReports, type AtlasPin, type AtlasRange } from "./atlas";

export interface AtlasActions {
  onViewNode: (id: string) => void;
  onViewObserver: (id: string) => void;
  onAnalyzePacket: (hash: string, observationId?: number) => void;
}

function SignalMeter({ label, value, min, max, unit, color }: { label: string; value: number | null; min: number; max: number; unit: string; color: string }) {
  const { t, i18n } = useTranslation();
  const text = value === null ? t("atlas.unavailable") : `${value.toLocaleString(i18n.language, { maximumFractionDigits: 1 })} ${unit}`;
  const level = value === null ? 0 : Math.round(16 * Math.max(0, Math.min(1, (value - min) / (max - min))));
  return <div className="min-w-0">
    <div className="mb-1 flex flex-col gap-0.5"><span className="text-xs">{label}</span><span className="whitespace-nowrap font-mono text-sm font-semibold text-text-bright">{value === null ? "—" : text}</span></div>
    <div role={value === null ? "img" : "meter"} aria-label={`${label}: ${text}`} aria-valuemin={value === null ? undefined : min} aria-valuemax={value === null ? undefined : max} aria-valuenow={value === null ? undefined : Math.max(min, Math.min(max, value))} aria-valuetext={text} className="flex h-4 gap-0.5">
      {Array.from({ length: 16 }, (_, index) => <span key={index} aria-hidden="true" className={`flex-1 rounded-[2px] ${index < level ? color : "bg-border-subtle"}`} />)}
    </div>
  </div>;
}

export function AtlasCard({ pin, range, active, heardOpen, onHeardToggle, onRemove, onMove, first, last, onViewNode, onViewObserver, onAnalyzePacket }: AtlasActions & {
  pin: AtlasPin; range: AtlasRange; active: boolean; heardOpen: boolean; onHeardToggle: () => void;
  onRemove: () => void; onMove: (direction: -1 | 1) => void; first: boolean; last: boolean;
}) {
  const { t, i18n } = useTranslation();
  const now = useTick(60_000);
  const id = useId();
  const query = useQuery({ queryKey: ["atlas-node", pin.publicKey], queryFn: ({ signal }) => loadAtlasNode(pin, signal), enabled: active, staleTime: 60_000, retry: false,
    refetchInterval: q => q.state.error ? false : 60_000, refetchIntervalInBackground: false });
  const node = query.data?.node;
  const sample = summarizeReports(query.data?.page.items ?? [], range, now);
  const latest = sample.reports[0];
  const heard = useQuery({ queryKey: ["packet-detail", latest?.packetHash], queryFn: ({ signal }) => getPacketDetail(latest!.packetHash, signal), enabled: active && heardOpen && !!latest, staleTime: 30_000, retry: false });
  const detail = heard.data;
  const correctOrigin = !detail || !detail.originPubkey || detail.originPubkey.toLowerCase() === pin.publicKey;
  const observers = correctOrigin ? [...new Map([...(detail?.observations ?? [])].sort((a, b) => a.heardAt - b.heardAt).map(row => [row.observerId, row])).values()].sort((a, b) => b.heardAt - a.heardAt) : [];
  const name = node?.name || pin.name || pin.publicKey.slice(0, 12).toUpperCase();
  const number = (value: number) => value.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  const maximum = Math.max(1, ...sample.bins);
  const time = (value: number) => new Date(value).toLocaleString(i18n.language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const button = "min-h-11 rounded border border-border bg-bg-raised px-3 text-xs hover:border-primary disabled:opacity-40 disabled:cursor-default";
  return <article aria-label={name} className="min-w-0 self-start overflow-hidden rounded-xl border border-border bg-bg-surface shadow-sm">
    <div className="h-1 bg-gradient-to-r from-primary via-secondary to-green" />
    <div className="space-y-4 p-4">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-base font-semibold text-text-bright"><button type="button" disabled={!node} onClick={() => node && onViewNode(node.id)} className="text-left hover:underline">{name}</button></h2>
          <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">{t(`atlas.roles.${node?.nodeType ?? 0}`, { defaultValue: t("atlas.roles.0") })}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span aria-hidden="true" className={`size-2 rounded-full ${node?.stale === false ? "bg-green" : node?.stale ? "bg-warn" : "bg-text-muted"}`} />
          <span>{t(node?.stale === false ? "atlas.recent" : node?.stale ? "atlas.stale" : "atlas.freshnessUnknown")}</span>
          {node && node.lastSeen > 0 && <><span aria-hidden="true">·</span><Timestamp value={node.lastSeen} /></>}
        </div>
      </header>
      {query.isPending ? <p role="status">{t("common.loading")}</p> : query.isError && <p role="status" className="text-warn">{t(node ? "atlas.refreshFailed" : "atlas.nodeUnavailable")} <button type="button" className="min-h-11 underline" onClick={() => void query.refetch()}>{t("atlas.retry")}</button></p>}
      {node && <>
        <section aria-label={t("atlas.activity")}>
          <div className="flex items-baseline justify-between gap-2"><span className="text-xs">{t("atlas.reports")}</span><strong className="font-mono text-xl text-text-bright">{number(sample.reports.length)}</strong></div>
          <svg role="img" aria-label={t("atlas.activityLabel", { count: sample.reports.length, range: t(`atlas.ranges.${range}`) })} viewBox={`0 0 ${sample.bins.length * 5} 40`} preserveAspectRatio="none" className="mt-2 h-14 w-full text-primary">
            {sample.bins.map((count, index) => <rect key={index} x={index * 5} y={40 - Math.max(1, count / maximum * 38)} width="3.5" height={Math.max(1, count / maximum * 38)} rx="0.6" fill={count ? "currentColor" : "var(--color-border)"}><title>{time(sample.since + index * 3_600_000)}: {count}</title></rect>)}
          </svg>
          <div className="mt-1 flex justify-between text-[11px] text-text-muted"><span>{t(`atlas.ranges.${range}`)}</span><span>{t("atlas.now")}</span></div>
          <p className="mt-1 text-[11px] text-text-normal">{t("atlas.sample", { limit: REPORT_LIMIT })}</p>
        </section>
        <div className="grid grid-cols-2 gap-4">
          <SignalMeter label={t("atlas.snr")} value={sample.snr} min={-30} max={30} unit="dB" color="bg-green" />
          <SignalMeter label={t("atlas.rssi")} value={sample.rssi} min={-140} max={0} unit="dBm" color="bg-secondary" />
        </div>
        {!sample.reports.length && <p className="text-xs">{t("atlas.noReports")}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={button} aria-expanded={heardOpen} aria-controls={`${id}-heard`} onClick={onHeardToggle}>{t("atlas.heardBy")} <span aria-hidden="true">{heardOpen ? "−" : "+"}</span></button>
          <button type="button" className={button} onClick={() => onViewNode(node.id)}>{t("atlas.openNode")} <span aria-hidden="true">↗</span></button>
        </div>
        {heardOpen && <section id={`${id}-heard`} aria-label={t("atlas.heardBy")} className="rounded-lg border border-border p-3 text-xs">
          <p className="mb-2 text-text-bright">{t("atlas.latestAdvert")}</p>
          {!latest ? <p>{t("atlas.noReports")}</p> : heard.isPending ? <p role="status">{t("common.loading")}</p> : heard.isError || !correctOrigin ? <p>{t("atlas.heardUnavailable")}</p> : <>
            <p className="mb-2">{t("atlas.observers", { count: observers.length })}</p>
            <ul className="max-h-44 overflow-y-auto">{observers.map(row => <li key={row.observerId} className="flex items-center justify-between gap-2 border-t border-border-subtle"><button type="button" className="min-h-11 min-w-0 break-words text-left text-primary hover:underline" onClick={() => onViewObserver(row.observerId)}>{row.observerName || row.observerId.slice(0, 8)}</button><span className="shrink-0 font-mono">{row.iata}</span></li>)}</ul>
            <button type="button" className="mt-2 min-h-11 text-primary underline" onClick={() => onAnalyzePacket(latest.packetHash, latest.id)}>{t("atlas.openAdvert")}</button>
          </>}
        </section>}
        <details className="text-xs">
          <summary className="min-h-8 cursor-pointer content-center text-text-normal">{t("atlas.statistics")}</summary>
          <div className="space-y-3 pt-2">
            <p>{t("atlas.definition")}</p>
            <p>{t("atlas.signalDefinition")}</p>
            {query.data?.page.hasMore && <p className="text-warn">{t("atlas.capped")}</p>}
            <dl className="grid grid-cols-2 gap-2">
              <dt>{t("atlas.hops")}</dt><dd className="text-right font-mono">{sample.hops === null ? "—" : number(sample.hops)}</dd>
              <dt>{t("atlas.neighbors")}</dt><dd className="text-right font-mono">{number(node.knownNeighborCount)}</dd>
              <dt>{t("atlas.radio")}</dt><dd className="break-words text-right">{node.radio || "—"}</dd>
              <dt>{t("atlas.scope")}</dt><dd className="break-words text-right">{node.defaultScope || "—"}</dd>
            </dl>
            <p className="break-all font-mono text-[10px]">{node.publicKey}</p>
            <details><summary className="min-h-8 cursor-pointer content-center">{t("atlas.chartValues")}</summary><div className="max-h-40 overflow-auto"><table className="w-full"><thead><tr><th className="text-left">{t("atlas.hour")}</th><th className="text-right">{t("atlas.reports")}</th></tr></thead><tbody>{sample.bins.map((count, index) => <tr key={index}><td>{time(sample.since + index * 3_600_000)}</td><td className="text-right">{count}</td></tr>)}</tbody></table></div></details>
            <p>{t("atlas.updated")} <Timestamp value={query.dataUpdatedAt} /></p>
          </div>
        </details>
      </>}
      <details className="border-t border-border-subtle pt-2 text-xs">
        <summary className="min-h-8 cursor-pointer content-center">{t("atlas.manage")}</summary>
        <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={button} disabled={first} onClick={() => onMove(-1)}>{t("atlas.earlier")}</button><button type="button" className={button} disabled={last} onClick={() => onMove(1)}>{t("atlas.later")}</button><button type="button" className={`${button} text-danger`} onClick={onRemove}>{t("atlas.remove")}</button></div>
      </details>
    </div>
  </article>;
}
