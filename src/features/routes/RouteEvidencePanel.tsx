import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getRouteEvidence, isNotFound } from "../../api/client";
import { DetailPanel, Section } from "../../components/DetailPanel";
import { CopyLinkButton } from "../../components/CopyLinkButton";
import { Timestamp } from "../../components/Timestamp";
import { Segmented } from "../stats/Segmented";
import { ResolvedHopBlock } from "../packets/PathData";

const actionClass = "min-h-9 rounded border border-border px-2 text-xs text-primary hover:bg-bg-raised disabled:opacity-40 disabled:cursor-not-allowed";

export interface RouteActions {
  onAnalyzePacket?: (hash: string, observationId: number) => void;
  onViewObserver?: (id: string) => void;
  onViewNode?: (id: string) => void;
}

export function RouteEvidencePanel({ iata, pathKey, onClose, onAnalyzePacket, onViewObserver, onViewNode }: RouteActions & { iata: string; pathKey: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const range = params.get("routeRange") === "7d" ? "7d" : params.get("routeRange") === "30d" ? "30d" : "24h";
  const rawSince = params.get("routeSince"), rawUntil = params.get("routeUntil");
  const fixed = rawSince !== null || rawUntil !== null;
  const since = Number(rawSince), until = Number(rawUntil);
  const invalid = fixed && (!rawSince || !rawUntil || !/^\d+$/.test(rawSince) || !/^\d+$/.test(rawUntil) || !Number.isSafeInteger(since) || !Number.isSafeInteger(until) || until <= since || until - since > 30 * 86400000);
  const query = useInfiniteQuery({
    queryKey: ["route-evidence", iata, pathKey, range, rawSince, rawUntil],
    queryFn: ({ pageParam, signal }) => getRouteEvidence(iata, pathKey, pageParam ? { pageCursor: pageParam, limit: 50 } : fixed ? { since, until, limit: 50 } : { range: range === "7d" ? "168h" : range === "30d" ? "720h" : "24h", limit: 50 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last, pages) => pages.length < 10 && last.hasMore ? last.nextPageCursor : undefined,
    enabled: !invalid,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const first = query.data?.pages[0];
  const reports = query.data?.pages.flatMap(page => page.items) ?? [];
  const capped = (query.data?.pages.length ?? 0) >= 10 && query.data?.pages.at(-1)?.hasMore;
  return <DetailPanel title={t("routeEvidence.title")} onClose={onClose} closeLabel={t("routeEvidence.close")} headerAction={first && <CopyLinkButton label={t("investigation.copy")} copiedLabel={t("observerPage.copied")} params={() => ({ tab: "Routes", route: pathKey, routeIata: iata, routeRange: range, routeSince: String(first.windowStart), routeUntil: String(first.windowEnd), hash: null, analyze: null, observation: null, path: null, observer: null, node: null })} />}>
    <Section title={t("routeEvidence.window")} first>
      <Segmented ariaLabel={t("routeEvidence.window")} value={fixed ? "" : range} options={[{ value: "24h", label: t("routeEvidence.day") }, { value: "7d", label: t("routeEvidence.week") }, { value: "30d", label: t("routeEvidence.month") }]} onChange={value => setParams(previous => { const next = new URLSearchParams(previous); next.set("routeRange", value); next.delete("routeSince"); next.delete("routeUntil"); return next; })} />
      {fixed && <p className="mt-2 text-xs text-text-muted">{t("routeEvidence.shared")}</p>}
      {first && <p className="mt-2 text-xs leading-relaxed text-text-normal">{new Date(first.windowStart).toISOString().slice(0, 19).replace("T", " ")} → {new Date(first.windowEnd).toISOString().slice(0, 19).replace("T", " ")} UTC</p>}
    </Section>
    {invalid ? <p role="alert" className="p-3 text-sm text-warn">{t("routeEvidence.invalid")}</p> : query.isPending ? <p role="status" className="p-3 text-sm text-text-muted">{t("routeEvidence.loading")}</p> : <>
      {query.isError && <div role="alert" className="p-3 space-y-2 text-sm text-warn"><p>{t(isNotFound(query.error) ? "routeEvidence.missing" : "routeEvidence.error")}</p><button className={actionClass} onClick={() => query.isFetchNextPageError ? void query.fetchNextPage() : void query.refetch()}>{t("routeEvidence.retry")}</button></div>}
      {first && <>
        <Section title={`${t("routeEvidence.savedPath")} · ${first.route.iata}`}>
          <p className="mb-2 text-xs leading-relaxed text-text-muted">{t("routeEvidence.width", { width: first.hashSize ?? "—" })}</p>
          <ol className="space-y-2">{first.route.hops.map((hop, index) => <li key={index} className="flex items-center gap-2 text-sm"><span className="text-text-muted">{index + 1}.</span><ResolvedHopBlock hop={{ confidence: "high", nodes: hop.node ? [hop.node] : [] }} label={hop.hashBytes.toUpperCase()} onViewNode={onViewNode} /><span className="truncate text-text-normal">{hop.node?.name ?? "—"}</span></li>)}</ol>
        </Section>
        <Section title={t("routeEvidence.reports", { count: reports.length })}>
          <p className="mb-2 text-xs text-text-normal">{t("routeEvidence.brief")}</p>
          <details className="mb-3 text-xs leading-relaxed text-text-muted"><summary className="cursor-pointer text-primary">{t("routeEvidence.definition")}</summary><p className="mt-2">{t("routeEvidence.match", { width: first.hashSize ?? "—" })}</p><p className="mt-2">{t("routeEvidence.caution")}</p><p className="mt-2">{t("routeEvidence.retention")}</p></details>
          {!first.matchAvailable ? <p className="text-sm text-text-normal">{t("routeEvidence.unavailable")}</p> : reports.length === 0 ? <p className="text-sm text-text-normal">{t("routeEvidence.empty")}</p> : <ul className="space-y-3">{reports.map(report => <li key={report.id} className="rounded border border-border bg-bg-base p-2 space-y-2">
            <div className="flex justify-between gap-2 text-xs"><code className="text-primary">{report.packetHash.slice(0, 8).toUpperCase()}</code><span className="text-text-muted">{report.payloadTypeName}</span></div>
            <p className="break-words text-sm text-text-bright">{report.observerName ?? report.observerId.slice(0, 8)}</p>
            <p className="text-xs text-text-normal"><Timestamp value={report.heardAt} ms /> · SNR {report.snr == null ? "—" : `${report.snr} dB`} · RSSI {report.rssi == null ? "—" : `${report.rssi} dBm`}</p>
            <div className="flex flex-wrap gap-2">{onAnalyzePacket && <button className={actionClass} onClick={() => onAnalyzePacket(report.packetHash, report.id)}>{t("investigation.inspect")}</button>}{onViewObserver && <button className={actionClass} onClick={() => onViewObserver(report.observerId)}>{t("investigation.observer")}</button>}</div>
          </li>)}</ul>}
          {query.hasNextPage && <button className={`${actionClass} mt-3`} disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>{t(query.isFetchingNextPage ? "routeEvidence.loading" : "routeEvidence.more")}</button>}
          {capped && <p className="mt-3 text-xs text-text-muted">{t("routeEvidence.cap")}</p>}
        </Section>
      </>}
    </>}
  </DetailPanel>;
}
