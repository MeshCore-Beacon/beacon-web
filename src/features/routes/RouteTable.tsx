import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useSearchParams } from "react-router-dom";
import { getKnownRoutesPage, searchKnownRoutes, searchCrossIATARoutes, getIatas, type RouteCursor } from "../../api/client";
import { useRegion, useRegionSelection } from "../../hooks/useRegion";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { DataTable, type Column } from "../../components/DataTable";
import { LoadingPill } from "../../components/LoadingPill";
import { MultiSelectDropdown } from "../../components/MultiSelectDropdown";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { RouteDetailPanel, type RouteActions } from "./RouteDetailPanel";
import { ResolvedHopBlock } from "../packets/PathData";
import type { KnownRoute, CrossIATARoute, ResolvedHop, RouteHop } from "../../types/api";

const inputClass =
  "text-[11px] font-mono bg-bg-surface border border-border rounded-sm px-2 py-1 text-text-bright " +
  "placeholder:text-text-dim transition-colors";

// stable id accessor for the paginator's dedup (module-level so the memo isn't rebuilt each render)
const routeId = (r: KnownRoute) => String(r.id);

// A run of route hops as a hash chain (reusing the packet path renderer); hops are high-confidence.
function HopChain({ hops }: { hops: RouteHop[] }) {
  return (
    <>
      {hops.map((hop, i) => {
        const resolved: ResolvedHop = { confidence: "high", nodes: hop.node ? [hop.node] : [] };
        return (
          <span key={i} className="contents">
            {i > 0 && <span className="text-text-dim" aria-hidden>→</span>}
            <ResolvedHopBlock hop={resolved} label={hop.hashBytes.toUpperCase()} />
          </span>
        );
      })}
    </>
  );
}

// Memoized so the 10s <Timestamp> ticks in sibling columns don't re-reconcile the chain and its popovers.
const RouteHopChain = memo(function RouteHopChain({ hops }: { hops: RouteHop[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1 font-mono text-[13px]">
      <HopChain hops={hops} />
    </div>
  );
});

// ids keep sorting stable when the headers are translated
const buildColumns = (t: TFunction): Column<KnownRoute>[] => [
  {
    id: "area",
    header: t("routes.columns.area"),
    sortValue: (r) => r.iata,
    cell: (r) => <Badge variant="default">{r.iata}</Badge>,
  },
  {
    id: "hops",
    header: t("routes.columns.hops"),
    sortValue: (r) => r.hopCount,
    cell: (r) => r.hopCount,
  },
  {
    id: "route",
    header: t("routes.columns.route"),
    cell: (r) => <RouteHopChain hops={r.hops} />,
  },
  {
    id: "obs",
    header: t("routes.columns.obs"),
    className: "text-text-muted",
    sortValue: (r) => r.observationCount,
    cell: (r) => r.observationCount.toLocaleString(),
  },
  {
    id: "firstSeen",
    header: t("routes.columns.firstSeen"),
    className: "text-text-muted",
    sortValue: (r) => r.firstSeen,
    cell: (r) => <Timestamp value={r.firstSeen} />,
  },
  {
    id: "lastSeen",
    header: t("routes.columns.lastSeen"),
    className: "text-text-muted",
    sortValue: (r) => r.lastSeen,
    cell: (r) => <Timestamp value={r.lastSeen} />,
  },
];

function RouteCard({ route: r }: { route: KnownRoute }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="default">{r.iata}</Badge>
        <span className="font-mono text-[11px] text-text-dim">{t("routes.hops", { count: r.hopCount })} · {t("routes.obs", { count: r.observationCount, value: r.observationCount.toLocaleString() })}</span>
      </div>
      <RouteHopChain hops={r.hops} />
      <div className="flex items-center gap-2 font-mono text-[11px] text-text-muted">
        <span>{t("routes.first")} <Timestamp value={r.firstSeen} /></span>
        <span aria-hidden>·</span>
        <span>{t("routes.last")} <Timestamp value={r.lastSeen} /></span>
      </div>
    </div>
  );
}

// A search result: a known route within one IATA, or a cross-IATA route flattened to the same shape.
interface SearchRow {
  key: string;
  area: string;
  hops: RouteHop[];
  hopCount: number;
  lastSeen: number;
  route?: KnownRoute;
}

const CROSS_KEY = "cross:";
const MAX_SEARCH_IATAS = 100;
const HASH_RE = /^(?:[0-9a-f]{2}){1,4}$/;

const knownRow = (r: KnownRoute): SearchRow =>
  ({ key: String(r.id), area: r.iata, hops: r.hops, hopCount: r.hopCount, lastSeen: r.lastSeen, route: r });

const crossRow = (r: CrossIATARoute, i: number): SearchRow => ({
  key: `${CROSS_KEY}${i}`,
  area: `${r.crossHop.fromIata} → ${r.crossHop.toIata}`,
  hops: [...r.sourceSegment, ...r.targetSegment],
  hopCount: r.totalHops,
  lastSeen: r.crossHop.lastSeen,
});

// Picked IATAs, else the region's, else undefined (global). Picking every area is the global search too.
function searchScope(picked: string[], regionIatas: string[] | undefined, allIatas: string[]): string[] | undefined {
  const dedupe = (codes: string[]) => [...new Set(codes.map((c) => c.toUpperCase()))].sort();
  if (picked.length) {
    const scope = dedupe(picked);
    const all = new Set(allIatas);
    return all.size > 0 && [...all].every((c) => scope.includes(c)) ? undefined : scope;
  }
  return regionIatas && dedupe(regionIatas);
}

// 400s carry a message meant for the user (bad hash, too many areas), so show it as-is.
function searchErrorText(err: unknown, t: TFunction): string {
  const status = (err as { status?: number }).status;
  if (status === 400 && err instanceof Error) return err.message;
  if (status === 503) return t("routes.timeout");
  return t("routes.searchFailed");
}

const buildSearchColumns = (t: TFunction): Column<SearchRow>[] => [
  {
    id: "area",
    header: t("routes.columns.area"),
    sortValue: (r) => r.area,
    cell: (r) => <Badge variant="default">{r.area}</Badge>,
  },
  {
    id: "hops",
    header: t("routes.columns.hops"),
    sortValue: (r) => r.hopCount,
    cell: (r) => r.hopCount,
  },
  {
    id: "route",
    header: t("routes.columns.route"),
    cell: (r) => <RouteHopChain hops={r.hops} />,
  },
  {
    id: "obs",
    header: t("routes.columns.obs"),
    className: "text-text-muted",
    sortValue: (r) => r.route?.observationCount,
    cell: (r) => r.route?.observationCount.toLocaleString(),
  },
  {
    id: "lastSeen",
    header: t("routes.columns.lastSeen"),
    className: "text-text-muted",
    sortValue: (r) => r.lastSeen,
    cell: (r) => <Timestamp value={r.lastSeen} />,
  },
];

function SearchRowCard({ row }: { row: SearchRow }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="default">{row.area}</Badge>
        <span className="font-mono text-[11px] text-text-dim">
          {t("routes.hops", { count: row.hopCount })}
          {row.route && <> · {t("routes.obs", { count: row.route.observationCount, value: row.route.observationCount.toLocaleString() })}</>}
        </span>
      </div>
      <RouteHopChain hops={row.hops} />
      <div className="font-mono text-[11px] text-text-muted">
        {t("routes.last")} <Timestamp value={row.lastSeen} />
      </div>
    </div>
  );
}

const renderSearchCard = (r: SearchRow) => <SearchRowCard row={r} />;

const renderRouteCard = (r: KnownRoute) => <RouteCard route={r} />;

export function RouteTable(actions: RouteActions) {
  const { t } = useTranslation();
  const columns = useMemo(() => buildColumns(t), [t]);
  const searchColumns = useMemo(() => buildSearchColumns(t), [t]);
  const { iatas, isResolved } = useRegion();
  const regionPending = isResolved === false;
  const { selection } = useRegionSelection();
  const [params, setParams] = useSearchParams();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const pathKey = params.get("route"), routeIata = params.get("routeIata");
  const closeRoute = useCallback(() => {
    // no-op when nothing is open, so callers (e.g. the region-change effect) can call it unconditionally
    if (!pathKey && !selectedKey) return;
    setSelectedKey(null);
    setParams(previous => { const next = new URLSearchParams(previous); for (const key of ["route", "routeIata"]) next.delete(key); return next; }, { replace: true });
  }, [pathKey, selectedKey, setParams]);


  // drop the selection when the region changes — the selected route may not be in the new region
  const prevRegion = useRef(selection);
  useEffect(() => {
    if (prevRegion.current !== selection) {
      prevRegion.current = selection;
      closeRoute();
    }
  }, [selection, closeRoute]);

  // path search form: source→dest hashes, optionally narrowed to picked IATAs (else the region's).
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchIatas, setSearchIatas] = useState<string[]>([]);
  const [search, setSearch] = useState<{ from: string; to: string; iatas: string[] | undefined } | null>(null);
  const [hashError, setHashError] = useState(false);

  // /routes filters by a single IATA only, so when the region resolves to exactly one IATA push the
  // filter to the server for true server-side paging; otherwise page unfiltered and filter the region
  // client-side below (a region can span several IATAs, which the endpoint can't express).
  const serverIata = iatas && iatas.length === 1 ? iatas[0] : undefined;

  // Page the route set on demand (50 at a time, cursor = last route's lastSeen + id) — the DataTable
  // pulls the next page via loadMore() as you scroll, instead of eagerly loading the whole set.
  const { items: listRoutes, loadedCount, isPaging, isError, isLoading: listLoading, loadMore, hasMore } =
    useInfinitePages<KnownRoute, RouteCursor>({
      queryKey: ["routes", serverIata ?? ""],
      queryFn: (cursor) => getKnownRoutesPage({ iata: serverIata, cursor }),
      getId: routeId,
      keepPrevious: true,
      auto: false,
      enabled: !regionPending,
    });

  // Two calls per search: routes within an IATA and routes crossing two. A one-IATA scope can't cross.
  // No retries: a 503 is the server's 15s search timeout, and retrying it just repeats that work.
  const scopeKey = search?.iatas?.join(",") ?? "*";
  const isCross = search != null && search.iatas?.length !== 1;
  const knownQuery = useQuery({
    queryKey: ["routes-search", scopeKey, search?.from, search?.to],
    queryFn: ({ signal }) => searchKnownRoutes(search!.iatas, search!.from, search!.to, signal),
    enabled: search !== null,
    retry: false,
    staleTime: 60_000,
  });
  const crossQuery = useQuery({
    queryKey: ["routes-cross", scopeKey, search?.from, search?.to],
    queryFn: ({ signal }) => searchCrossIATARoutes(search!.iatas, search!.from, search!.to, signal),
    enabled: isCross,
    retry: false,
    staleTime: 60_000,
  });

  // IATA options for the path-search multi-select, from /iatas (shares the region picker's cached
  // query). The label carries the display name so the dropdown's search filter matches on it.
  const { data: iataCodes } = useQuery({
    queryKey: ["iatas"],
    queryFn: getIatas,
    staleTime: 5 * 60_000,
  });
  const allIatas = useMemo(() => (iataCodes ?? []).map((i) => i.iata), [iataCodes]);
  const iataOptions = useMemo(
    () => (iataCodes ?? []).map((i) => ({ value: i.iata, label: i.displayName ? `${i.iata} — ${i.displayName}` : i.iata })),
    [iataCodes],
  );

  // searching shows the server's matches as-is; otherwise show the region-filtered full list (empty
  // region = all). Filtering by IATA stays client-side, consistent with the other tabs.
  const rows = useMemo(() => {
    if (search) return knownQuery.data;
    if (regionPending) return [];
    if (!iatas) return listRoutes;
    const set = new Set(iatas);
    return listRoutes.filter((r) => set.has(r.iata));
  }, [search, knownQuery.data, listRoutes, iatas, regionPending]);

  const searchLoading = knownQuery.isLoading || (isCross && crossQuery.isLoading);
  // presorted so the table's stable hop-count sort breaks ties newest-first
  const searchRows = useMemo(() => {
    if (!search || searchLoading) return undefined;
    return [...(knownQuery.data ?? []).map(knownRow), ...(isCross ? crossQuery.data ?? [] : []).map(crossRow)]
      .sort((a, b) => a.hopCount - b.hopCount || b.lastSeen - a.lastSeen);
  }, [search, searchLoading, isCross, knownQuery.data, crossQuery.data]);
  const searchErrors = [...new Set(
    [knownQuery.error, isCross ? crossQuery.error : null].filter(Boolean).map((e) => searchErrorText(e, t)),
  )];

  const selectedRoute = useMemo(
    () => rows?.find((r) => String(r.id) === selectedKey),
    [rows, selectedKey],
  );

  const selectRoute = (id: string | null) => {
    if (id === null) { closeRoute(); return; }
    if (id.startsWith(CROSS_KEY)) return; // cross-IATA routes have no detail view
    const route = rows?.find(row => String(row.id) === id);
    if (route?.pathKey) {
      setSelectedKey(null);
      setParams(previous => { const next = new URLSearchParams(previous); next.set("route", route.pathKey!); next.set("routeIata", route.iata); return next; }, { replace: true });
    } else {
      closeRoute();
      setSelectedKey(id);
    }
  };

  // A multi-IATA region filters globally-paged rows client-side, so the filtered list can be too
  // short to ever trigger scroll paging — or empty, with the region's routes deeper in the cursor
  // stream. Keep pulling pages until there's a screenful or the cap says the region is just sparse.
  useEffect(() => {
    if (search || serverIata || !iatas?.length) return;
    if (!hasMore || isPaging) return;
    if ((rows?.length ?? 0) >= 50 || loadedCount >= 1000) return;
    loadMore();
  }, [search, serverIata, iatas, hasMore, isPaging, rows, loadedCount, loadMore]);

  const isMobile = useIsMobile();
  const panelOpen = Boolean(pathKey && routeIata || selectedRoute);
  const scope = useMemo(() => searchScope(searchIatas, iatas, allIatas), [searchIatas, iatas, allIatas]);
  const tooManyAreas = (scope?.length ?? 0) > MAX_SEARCH_IATAS;
  const emptyRegion = scope?.length === 0;
  const canSearch = !!(from.trim() && to.trim()) && !regionPending && !tooManyAreas && !emptyRegion;
  // clear any selection when the visible list changes out from under it (search submit/clear)
  const submitSearch = useCallback(() => {
    if (!canSearch) return;
    const fromHash = from.trim().toLowerCase(), toHash = to.trim().toLowerCase();
    if (!HASH_RE.test(fromHash) || !HASH_RE.test(toHash)) { setHashError(true); return; }
    setHashError(false);
    setSearch({ from: fromHash, to: toHash, iatas: scope });
    closeRoute();
  }, [canSearch, from, to, scope, closeRoute]);
  const clearSearch = useCallback(() => {
    setSearch(null);
    closeRoute();
  }, [closeRoute]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submitSearch();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* stacks into two rows on mobile (the inputs would otherwise wrap around the arrow); one row at md+ */}
      <div className={`${panelOpen ? "hidden md:flex" : "flex"} flex-col md:flex-row md:flex-wrap md:items-center gap-1.5 gap-y-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0`}>
        <div className="flex items-center gap-1.5">
          <span className="hidden md:inline text-text-muted text-[11px] uppercase tracking-wider mr-1 shrink-0">{t("routes.findPath")}</span>
          <input
            className={`${inputClass} h-7 flex-1 min-w-0 md:flex-none md:w-24`}
            placeholder={t("routes.fromPlaceholder")}
            aria-label={t("routes.fromLabel")}
            value={from}
            onChange={(e) => { setFrom(e.target.value); setHashError(false); }}
            onKeyDown={onKeyDown}
          />
          <span className="text-text-dim text-xs shrink-0" aria-hidden>→</span>
          <input
            className={`${inputClass} h-7 flex-1 min-w-0 md:flex-none md:w-24`}
            placeholder={t("routes.toPlaceholder")}
            aria-label={t("routes.toLabel")}
            value={to}
            onChange={(e) => { setTo(e.target.value); setHashError(false); }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0 md:flex-none">
            <MultiSelectDropdown
              label={t("routes.areas")}
              options={iataOptions}
              selected={searchIatas}
              onChange={setSearchIatas}
              align="left"
              fullWidth={isMobile}
            />
          </div>
          <button
            type="button"
            onClick={submitSearch}
            disabled={!canSearch}
            className="h-7 text-[11px] font-mono px-3 rounded-sm border border-border bg-bg-surface text-text-normal hover:border-primary-dim disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            {t("routes.search")}
          </button>
          {search && (
            <button
              type="button"
              onClick={clearSearch}
              className="h-7 text-[11px] font-mono px-2 rounded-sm text-text-dim hover:text-text-normal cursor-pointer transition-colors"
            >
              {t("routes.clear")}
            </button>
          )}
        </div>
        {(hashError || tooManyAreas) && (
          <span className="font-mono text-[11px] text-warn">{t(hashError ? "routes.badHash" : "routes.tooManyAreas")}</span>
        )}
      </div>
      {search && searchErrors.length > 0 && (searchRows?.length ?? 0) > 0 && (
        <div role="alert" className="px-4 py-1.5 border-b border-border-subtle font-mono text-[11px] text-danger">
          {searchErrors.join(" · ")}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {search ? (
          <div key="search" className={`flex-1 min-w-0 ${panelOpen ? "hidden md:flex" : "flex"} flex-col min-h-0`}>
            <DataTable
              columns={searchColumns}
              rows={searchRows}
              rowKey={(r) => r.key}
              selectedKey={pathKey ? String(rows?.find(row => row.pathKey === pathKey && row.iata === routeIata)?.id ?? "") : selectedKey}
              onSelect={selectRoute}
              isLoading={searchLoading}
              emptyLabel={searchErrors.length > 0 ? searchErrors.join(" · ") : t("routes.noMatches")}
              defaultSort={{ id: "hops", direction: "asc" }}
              renderCard={renderSearchCard}
            />
          </div>
        ) : (
          <div key="list" className={`relative flex-1 min-w-0 ${panelOpen ? "hidden md:flex" : "flex"} flex-col min-h-0`}>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => String(r.id)}
              selectedKey={pathKey ? String(rows?.find(row => row.pathKey === pathKey && row.iata === routeIata)?.id ?? "") : selectedKey}
              onSelect={selectRoute}
              isLoading={listLoading || regionPending}
              emptyLabel={t("routes.empty")}
              defaultSort={{ id: "lastSeen", direction: "desc" }}
              onEndReached={loadMore}
              renderCard={renderRouteCard}
            />
            <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun="routes" position="bottom-3 right-3" />
          </div>
        )}
        {pathKey && routeIata ? (
          <RouteDetailPanel key={`${routeIata}:${pathKey}`} route={rows?.find(row => row.pathKey === pathKey && row.iata === routeIata)} iata={routeIata} pathKey={pathKey} onClose={closeRoute} {...actions} />
        ) : selectedRoute && (
          <RouteDetailPanel route={selectedRoute} onClose={() => setSelectedKey(null)} {...actions} />
        )}
      </div>
    </div>
  );
}
