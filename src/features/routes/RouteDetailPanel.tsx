import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DetailPanel, Section, Field } from "../../components/DetailPanel";
import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { CopyLinkButton } from "../../components/CopyLinkButton";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { getRouteEvidence, isNotFound } from "../../api/client";
import { formatSnr, snrLevel, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { ResolvedHopBlock } from "../packets/PathData";
import type { KnownRoute, ResolvedHop } from "../../types/api";

export interface RouteActions {
  onAnalyzePacket?: (hash: string, observationId: number) => void;
  onViewObserver?: (id: string) => void;
  onViewNode?: (id: string) => void;
}

// The server's widest window; packet retention is what actually bounds the list.
const RECENT_RANGE = "720h";
const PAGE_LIMIT = 50;
const MAX_PAGES = 10;

interface RouteDetailPanelProps extends RouteActions {
  route?: KnownRoute;
  iata?: string;
  pathKey?: string;
  onClose: () => void;
}

// The regular view follows retention. Copied links also pin the time window and
// representation, so a later hash-width update cannot silently change the evidence.
export function RouteDetailPanel({ route: listed, iata, pathKey, onClose, onAnalyzePacket, onViewObserver, onViewNode }: RouteDetailPanelProps) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [openedAt] = useState(Date.now);
  const rawSince = params.get("routeSince"), rawUntil = params.get("routeUntil");
  const rawWidth = params.get("routeHashSize"), rawPath = params.get("routePathBytes");
  const fixed = rawSince !== null || rawUntil !== null;
  const since = Number(rawSince), until = Number(rawUntil), hashSize = Number(rawWidth);
  const pinned = rawWidth !== null || rawPath !== null;
  const invalidWindow = fixed && (params.getAll("routeSince").length !== 1 || params.getAll("routeUntil").length !== 1 || !rawSince || !rawUntil || !/^\d+$/.test(rawSince) || !/^\d+$/.test(rawUntil) || !Number.isSafeInteger(since) || !Number.isSafeInteger(until) || until <= since || until > openedAt || until - since > 30 * 86_400_000);
  const invalidPath = pinned && (params.getAll("routeHashSize").length !== 1 || params.getAll("routePathBytes").length !== 1 || !rawWidth || !/^[1-3]$/.test(rawWidth) || !rawPath || !/^[0-9a-f]+$/.test(rawPath) || rawPath.length < 4 * hashSize || rawPath.length > 126 * hashSize || rawPath.length % (2 * hashSize) !== 0);
  const pathParams = pinned && !invalidPath ? { hashSize, pathBytes: rawPath! } : {};
  const invalid = invalidWindow || invalidPath;
  const keyed = !!iata && !!pathKey;
  const query = useInfiniteQuery({
    queryKey: ["route-evidence", iata, pathKey, rawSince, rawUntil, rawWidth, rawPath],
    queryFn: ({ pageParam, signal }) => getRouteEvidence(iata!, pathKey!, pageParam ? { pageCursor: pageParam, limit: PAGE_LIMIT } : fixed ? { since, until, ...pathParams, limit: PAGE_LIMIT } : { range: RECENT_RANGE, ...pathParams, limit: PAGE_LIMIT }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last, pages) => pages.length < MAX_PAGES && last.hasMore ? last.nextPageCursor : undefined,
    enabled: keyed && !invalid,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const first = query.data?.pages[0];
  const route = listed ?? first?.route;
  const reports = query.data?.pages.flatMap(page => page.items) ?? [];
  const capped = (query.data?.pages.length ?? 0) >= MAX_PAGES && query.data?.pages.at(-1)?.hasMore;

  return (
    <DetailPanel
      title={t("routeDetail.title")}
      onClose={onClose}
      isLoading={!route && query.isPending && keyed && !invalid}
      headerAction={keyed && !invalid && <CopyLinkButton label={t("investigation.copy")} copiedLabel={t("observerPage.copied")} params={() => ({ tab: "Routes", route: pathKey!, routeIata: iata!, routeRange: null, routeSince: first ? String(first.windowStart) : rawSince, routeUntil: first ? String(first.windowEnd) : rawUntil, routeHashSize: first ? first.matchAvailable && first.hashSize && first.pathBytes ? String(first.hashSize) : null : rawWidth, routePathBytes: first ? first.matchAvailable && first.hashSize && first.pathBytes ? first.pathBytes : null : rawPath, hash: null, analyze: null, observation: null, path: null, observer: null, node: null })} />}
    >
      {invalid && <p role="alert" className="p-4 text-sm text-warn">{t(invalidPath ? "routeEvidence.invalidPath" : "routeEvidence.invalid")}</p>}
      {route && <>
        <Section title={t("routeDetail.summary")} first>
          <div className="flex items-center gap-3 font-mono text-[13px]">
            <Badge variant="default">{route.iata}</Badge>
            <Field label={t("routeDetail.hops")} value={route.hopCount} />
            <Field label={t("routeDetail.heard")} value={route.observationCount.toLocaleString()} />
          </div>
        </Section>

        <Section title={t("routeDetail.route")}>
          <div className="flex flex-col gap-1.5">
            {route.hops.map((hop, i) => {
              const resolved: ResolvedHop = { confidence: "high", nodes: hop.node ? [hop.node] : [] };
              return (
                <div key={i} className="flex items-center gap-2 font-mono text-[13px]">
                  <span className="text-text-dim w-6 shrink-0">#{i + 1}</span>
                  <ResolvedHopBlock hop={resolved} label={(first?.matchAvailable && first.pathBytes && first.hashSize ? first.pathBytes.slice(i * first.hashSize * 2, (i + 1) * first.hashSize * 2) : hop.hashBytes).toUpperCase()} onViewNode={onViewNode} />
                  {hop.node?.name && <span className="text-text-muted truncate">{hop.node.name}</span>}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title={t("routeDetail.timestamps")}>
          <div className="flex flex-col gap-0.5 font-mono text-[13px]">
            <Field label={t("routeDetail.firstSeen")} value={<Timestamp value={route.firstSeen} />} />
            <Field label={t("routeDetail.lastSeen")} value={<Timestamp value={route.lastSeen} />} />
          </div>
        </Section>
      </>}

      {keyed && !invalid && (route || query.isError) && (
        <Section title={t("routeEvidence.recent")}>
          {query.isError && (
            <div role="alert" className="mb-2 space-y-2 text-sm text-warn">
              <p>{t(isNotFound(query.error) ? "routeEvidence.missing" : "routeEvidence.error")}</p>
              <button className={ACTION_BUTTON_CLASS} onClick={() => query.isFetchNextPageError ? void query.fetchNextPage() : void query.refetch()}>{t("routeEvidence.retry")}</button>
            </div>
          )}
          {query.isPending ? <p role="status" className="text-sm text-text-muted">{t("routeEvidence.loading")}</p>
            : first && !first.matchAvailable ? <p className="text-sm text-text-normal">{t("routeEvidence.unavailable")}</p>
            : first && reports.length === 0 ? <p className="text-sm text-text-normal">{t("routeEvidence.empty")}</p>
            : (
              <ul className="space-y-3">
                {reports.map(report => {
                  const level = snrLevel(report.snr);
                  return (
                    <li key={report.id} className="rounded border border-border bg-bg-base p-2 space-y-2">
                      <div className="flex justify-between gap-2 text-xs"><code className="text-primary">{report.packetHash.slice(0, 8).toUpperCase()}</code><span className="text-text-muted">{report.payloadTypeName}</span></div>
                      <p className="break-words text-sm text-text-bright">{report.observerName ?? report.observerId.slice(0, 8)}</p>
                      <p className="text-xs text-text-normal"><Timestamp value={report.heardAt} ms /> · SNR <span className={level ? SIGNAL_LEVEL_CLASSES[level] : ""}>{formatSnr(report.snr)}</span>{report.snr != null && " dB"} · RSSI {report.rssi == null ? "—" : `${report.rssi} dBm`}</p>
                      <div className="flex flex-wrap gap-2">
                        {onAnalyzePacket && <button className={ACTION_BUTTON_CLASS} onClick={() => onAnalyzePacket(report.packetHash, report.id)}>{t("routeEvidence.inspect")}</button>}
                        {onViewObserver && <button className={ACTION_BUTTON_CLASS} onClick={() => onViewObserver(report.observerId)}>{t("investigation.observer")}</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          {query.hasNextPage && <button className={`${ACTION_BUTTON_CLASS} mt-3`} disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>{t(query.isFetchingNextPage ? "routeEvidence.loading" : "routeEvidence.more")}</button>}
          {capped && <p className="mt-3 text-xs text-text-muted">{t("routeEvidence.cap")}</p>}
        </Section>
      )}
    </DetailPanel>
  );
}
