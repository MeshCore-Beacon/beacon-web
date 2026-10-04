import { NodeTypeBadge } from "../../components/NodeTypeBadge";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getNode, getNodeNeighbors, getNodeObservations, isNotFound } from "../../api/client";
import { Timestamp } from "../../components/Timestamp";
import { CopyLinkButton } from "../../components/CopyLinkButton";
import { Sparkline } from "../../components/Sparkline";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { useTick } from "../../hooks/useTick";
import { summarizeReports, REPORT_LIMIT, type AtlasRange } from "../atlas/atlas";
import { NodeTelemetry } from "./NodeTelemetry";
import { formatClockDrift } from "../../lib/formatters";

export function NodePage({ nodeId, onViewNode, onViewObserver, onAnalyzePacket }: {
  nodeId: string; onViewNode: (id: string) => void; onViewObserver: (id: string) => void;
  onAnalyzePacket: (hash: string, observationId?: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const range: AtlasRange = params.get("nodeRange") === "3d" ? "3d" : "24h";
  const valid = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(nodeId);
  const now = useTick(60_000);
  const detail = useQuery({ queryKey: ["node", nodeId], queryFn: ({ signal }) => getNode(nodeId, signal), enabled: valid, staleTime: 30_000, refetchInterval: 60_000, refetchIntervalInBackground: false });
  const reports = useQuery({ queryKey: ["node-page-reports", nodeId], queryFn: ({ signal }) => getNodeObservations(nodeId, { limit: REPORT_LIMIT }, signal), enabled: valid && !!detail.data, staleTime: 60_000, refetchInterval: 60_000, refetchIntervalInBackground: false });
  const neighbors = useQuery({ queryKey: ["node-neighbors", nodeId], queryFn: () => getNodeNeighbors(nodeId), enabled: valid && !!detail.data, staleTime: 120_000, refetchInterval: 120_000, refetchIntervalInBackground: false });
  const node = detail.data;
  const sample = summarizeReports(reports.data?.items ?? [], range, now);
  const ordered = [...sample.reports].reverse();
  const mix = new Map<string, number>();
  const regions = new Map<string, number>();
  for (const report of sample.reports) { mix.set(report.payloadTypeName, (mix.get(report.payloadTypeName) ?? 0) + 1); regions.set(report.iata, (regions.get(report.iata) ?? 0) + 1); }
  const number = (value: number | null, unit = "") => value == null ? "—" : `${value.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}${unit}`;
  const box = "min-w-0 rounded-xl border border-border bg-bg-surface p-4";
  return <section aria-label={t("nodePage.title")} className="min-h-0 min-w-0 w-full overflow-y-auto p-3 md:p-5">
    <div className="mx-auto max-w-[1600px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <button className={ACTION_BUTTON_CLASS} onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.delete("nodePage"); next.delete("nodeRange"); return next; })}>← {t("nodePage.back")}</button>
        <CopyLinkButton params={{ tab: "Nodes", nodePage: nodeId }} />
      </header>
      {!valid || (detail.isError && !node) ? <p role="alert">{t(!valid || isNotFound(detail.error) ? "nodeDetail.notFound" : "nodePage.loadError")}{valid && !isNotFound(detail.error) && <> <button className={ACTION_BUTTON_CLASS} onClick={() => void detail.refetch()}>{t("atlas.retry")}</button></>}</p> : detail.isPending ? <p role="status">{t("common.loading")}</p> : node && <>
        {detail.isError && <p role="status" className="text-sm text-warn">{t("atlas.refreshFailed")}</p>}
        <div className={`${box} flex flex-wrap items-start justify-between gap-3`}>
          <div className="min-w-0"><h1 className="break-words text-xl font-semibold text-text-bright">{node.name || node.publicKey.slice(0, 12)}</h1><p className="mt-1 text-xs text-text-muted"><NodeTypeBadge typeName={node.nodeTypeName} observer={node.isObserver} /> · <Timestamp value={node.lastSeen} /></p><code className="mt-2 block break-all text-[10px] text-text-muted">{node.publicKey}</code></div>
          <div className="flex flex-wrap gap-2"><button className={ACTION_BUTTON_CLASS} onClick={() => onViewNode(node.id)}>{t("nodePage.inspect")}</button>{node.observerId && <button className={ACTION_BUTTON_CLASS} onClick={() => onViewObserver(node.observerId!)}>{t("nodePage.observer")}</button>}</div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted"><span>{t("atlas.sample", { limit: REPORT_LIMIT })}</span><select className="min-h-11 rounded border border-border bg-bg-surface px-3" aria-label={t("atlas.range")} value={range} onChange={e => setParams(previous => { const next = new URLSearchParams(previous); next.set("nodeRange", e.target.value); return next; })}><option value="24h">{t("atlas.ranges.24h")}</option><option value="3d">{t("atlas.ranges.3d")}</option></select></div>
        {reports.isError && <p role="alert" className="text-sm text-warn">{t("atlas.refreshFailed")}</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: t("atlas.reports"), value: reports.data ? number(sample.reports.length) : "—", values: sample.bins },
            { label: t("atlas.snr"), value: number(sample.snr, " dB"), values: ordered.map(p => p.rssi === 0 && p.snr === 0 ? null : p.snr ?? null) },
            { label: t("atlas.rssi"), value: number(sample.rssi, " dBm"), values: ordered.map(p => p.rssi === 0 && p.snr === 0 ? null : p.rssi ?? null) },
            { label: t("atlas.hops"), value: number(sample.hops), values: ordered.map(p => p.hopCount ?? null) },
          ].map(metric => <div className={box} key={metric.label}><p className="text-xs text-text-muted">{metric.label}</p><p className="mt-1 font-mono text-xl text-text-bright">{metric.value}</p><Sparkline values={metric.values} color="var(--color-primary)" /></div>)}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className={box}><h2 className="mb-3 text-sm font-semibold">{t("nodePage.packetTypes")}</h2>{[...mix].sort((a,b) => b[1]-a[1]).map(([type,count]) => <div key={type} className="mb-2"><div className="flex justify-between text-xs"><span>{type}</span><span>{number(count)}</span></div><div className="mt-1 h-2 rounded bg-bg-base"><div className="h-full rounded bg-primary" style={{ width: `${100 * count / Math.max(1, sample.reports.length)}%` }} /></div></div>)}</div>
          <div className={box}><h2 className="mb-3 text-sm font-semibold">{t("nodePage.regions")}</h2>{[...regions].sort((a,b) => b[1]-a[1]).map(([iata,count]) => <div key={iata} className="mb-2 flex items-center gap-2 text-xs"><span className="w-10 font-mono">{iata}</span><span className="h-2 flex-1 rounded bg-bg-base"><span className="block h-full rounded bg-secondary" style={{width:`${100*count/Math.max(1,sample.reports.length)}%`}} /></span><span>{number(count)}</span></div>)}</div>
          <div className={box}><NodeTelemetry node={node} /><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><dt>{t("atlas.radio")}</dt><dd>{node.radio || "—"}</dd><dt>{t("atlas.scope")}</dt><dd>{node.defaultScope || "—"}</dd><dt>{t("nodePage.clock")}</dt><dd>{node.clockDriftSeconds != null ? formatClockDrift(node.clockDriftSeconds) : "—"}</dd><dt>{t("nodePage.firstSeen")}</dt><dd><Timestamp value={node.firstSeen} /></dd></dl></div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className={box}><h2 className="mb-3 text-sm font-semibold">{t("nodePage.neighbors", { count: node.knownNeighborCount })}</h2><div className="max-h-80 overflow-auto">{neighbors.data?.map(neighbor => <button key={neighbor.id} className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-border-subtle text-left text-xs" onClick={() => onViewNode(neighbor.id)}><span className="min-w-0 truncate text-primary">{neighbor.name || neighbor.publicKey}</span><span>{neighbor.iata} · {number(neighbor.observationCount)}</span></button>)}</div></div>
          <div className={box}><h2 className="mb-3 text-sm font-semibold">{t("nodeDetail.recentPackets")}</h2><div className="max-h-80 overflow-auto">{sample.reports.slice(0,50).map(report => <button key={report.id} className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-border-subtle text-left text-xs" onClick={() => onAnalyzePacket(report.packetHash, report.id)}><code className="text-primary">{report.packetHash.slice(0,8).toUpperCase()}</code><span>{report.payloadTypeName} · {report.iata}</span><Timestamp value={report.heardAt} /></button>)}</div></div>
        </div>
      </>}
    </div>
  </section>;
}
