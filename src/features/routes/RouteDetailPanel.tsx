import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DetailPanel, Section, Field } from "../../components/DetailPanel";
import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { InfoTip } from "../../components/InfoTip";
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

// A shared link only carries iata + pathKey, so the route itself can arrive with the first packet page.
export function RouteDetailPanel({ route: listed, iata, pathKey, onClose, onAnalyzePacket, onViewObserver, onViewNode }: RouteDetailPanelProps) {
  const { t } = useTranslation();
  const keyed = !!iata && !!pathKey;
  const query = useInfiniteQuery({
    queryKey: ["route-evidence", iata, pathKey],
    queryFn: ({ pageParam, signal }) => getRouteEvidence(iata!, pathKey!, pageParam ? { pageCursor: pageParam, limit: PAGE_LIMIT } : { range: RECENT_RANGE, limit: PAGE_LIMIT }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last, pages) => pages.length < MAX_PAGES && last.hasMore ? last.nextPageCursor : undefined,
    enabled: keyed,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const first = query.data?.pages[0];
  const route = listed ?? first?.route;
  const reports = query.data?.pages.flatMap(page => page.items) ?? [];
  const capped = (query.data?.pages.length ?? 0) >= MAX_PAGES && query.data?.pages.at(-1)?.hasMore;
  const width = first?.matchAvailable && first.hashSize ? first.hashSize : "—";

  return (
    <DetailPanel
      title="Route Detail"
      onClose={onClose}
      isLoading={!route && query.isPending && keyed}
      headerAction={keyed && <CopyLinkButton label={t("investigation.copy")} copiedLabel={t("observerPage.copied")} params={() => ({ tab: "Routes", route: pathKey!, routeIata: iata!, hash: null, analyze: null, observation: null, path: null, observer: null, node: null })} />}
    >
      {route && <>
        <Section title="Summary" first>
          <div className="flex items-center gap-3 font-mono text-[13px]">
            <Badge variant="default">{route.iata}</Badge>
            <Field label="Hops" value={route.hopCount} />
            <Field label="Heard" value={route.observationCount.toLocaleString()} />
          </div>
        </Section>

        <Section title="Route">
          <div className="flex flex-col gap-1.5">
            {route.hops.map((hop, i) => {
              const resolved: ResolvedHop = { confidence: "high", nodes: hop.node ? [hop.node] : [] };
              return (
                <div key={i} className="flex items-center gap-2 font-mono text-[13px]">
                  <span className="text-text-dim w-6 shrink-0">#{i + 1}</span>
                  <ResolvedHopBlock hop={resolved} label={hop.hashBytes.toUpperCase()} onViewNode={onViewNode} />
                  {hop.node?.name && <span className="text-text-muted truncate">{hop.node.name}</span>}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Timestamps">
          <div className="flex flex-col gap-0.5 font-mono text-[13px]">
            <Field label="First seen" value={<Timestamp value={route.firstSeen} />} />
            <Field label="Last seen" value={<Timestamp value={route.lastSeen} />} />
          </div>
        </Section>
      </>}

      {keyed && (route || query.isError) && (
        <Section title={<span className="inline-flex items-center gap-1.5">{t("routeEvidence.recent")}<InfoTip text={[t("routeEvidence.match", { width }), t("routeEvidence.caution"), t("routeEvidence.retention")]} /></span>}>
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
