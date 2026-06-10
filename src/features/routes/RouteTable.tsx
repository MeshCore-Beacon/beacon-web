import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getKnownRoutesPage, searchKnownRoutes, searchCrossIATARoutes, getIatas } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { DataTable, type Column } from "../../components/DataTable";
import { LoadingPill } from "../../components/LoadingPill";
import { MultiSelectDropdown } from "../../components/MultiSelectDropdown";
import { RouteDetailPanel } from "./RouteDetailPanel";
import { ResolvedHopBlock } from "../packets/PathData";
import { formatHex } from "../../lib/formatters";
import type { KnownRoute, CrossIATARoute, ResolvedHop, ResolvedNode, RouteHop } from "../../types/api";

const inputClass =
  "text-[11px] font-mono bg-bg-surface border border-border rounded-sm px-2 py-1 text-text-bright " +
  "placeholder:text-text-dim transition-colors";

// stable id accessor for the paginator's dedup (module-level so the memo isn't rebuilt each render)
const routeId = (r: KnownRoute) => String(r.id);

const nodeLabel = (n: ResolvedNode) => n.name ?? formatHex(n.publicKey);

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
const RouteHopChain = memo(function RouteHopChain({ route }: { route: KnownRoute }) {
  return (
    <div className="flex flex-wrap items-center gap-1 font-mono text-[13px]">
      <HopChain hops={route.hops} />
    </div>
  );
});

// A cross-IATA route: source segment → boundary hop (the two nodes that bridge the IATAs) → target segment.
function CrossRouteCard({ route }: { route: CrossIATARoute }) {
  const { crossHop } = route;
  return (
    <div className="bg-bg-base border border-border rounded px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge variant="default">{crossHop.fromIata}</Badge>
          <span className="text-text-dim" aria-hidden>→</span>
          <Badge variant="default">{crossHop.toIata}</Badge>
        </div>
        <span className="font-mono text-[11px] text-text-dim">{route.totalHops} hops</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 font-mono text-[13px]">
        <HopChain hops={route.sourceSegment} />
        {route.sourceSegment.length > 0 && <span className="text-warn" aria-hidden>⇒</span>}
        <span className="text-primary font-semibold">{nodeLabel(crossHop.fromNode)}</span>
        <span className="text-warn" aria-hidden>⇒</span>
        <span className="text-primary font-semibold">{nodeLabel(crossHop.toNode)}</span>
        {route.targetSegment.length > 0 && <span className="text-warn" aria-hidden>⇒</span>}
        <HopChain hops={route.targetSegment} />
      </div>
    </div>
  );
}

const COLUMNS: Column<KnownRoute>[] = [
  {
    header: "IATA",
    sortValue: (r) => r.iata,
    cell: (r) => <Badge variant="default">{r.iata}</Badge>,
  },
  {
    header: "Hops",
    sortValue: (r) => r.hopCount,
    cell: (r) => r.hopCount,
  },
  {
    header: "Route",
    cell: (r) => <RouteHopChain route={r} />,
  },
  {
    header: "Obs",
    className: "text-text-muted",
    sortValue: (r) => r.observationCount,
    cell: (r) => r.observationCount.toLocaleString(),
  },
  {
    header: "First seen",
    className: "text-text-muted",
    sortValue: (r) => r.firstSeen,
    cell: (r) => <Timestamp value={r.firstSeen} />,
  },
  {
    header: "Last seen",
    className: "text-text-muted",
    sortValue: (r) => r.lastSeen,
    cell: (r) => <Timestamp value={r.lastSeen} />,
  },
];

function renderRouteCard(r: KnownRoute) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="default">{r.iata}</Badge>
        <span className="font-mono text-[11px] text-text-dim">{r.hopCount} hops · {r.observationCount.toLocaleString()} obs</span>
      </div>
      <RouteHopChain route={r} />
      <div className="flex items-center gap-2 font-mono text-[11px] text-text-muted">
        <span>first <Timestamp value={r.firstSeen} /></span>
        <span aria-hidden>·</span>
        <span>last <Timestamp value={r.lastSeen} /></span>
      </div>
    </div>
  );
}

interface SearchParams {
  from: string;
  to: string;
  iatas: string[];
}

// every directed (a,b), a≠b pair of the selected IATAs — we don't know which IATA holds the source
// vs dest hash, so we try all directions and flatten.
function directedPairs(iatas: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (const a of iatas) for (const b of iatas) if (a !== b) pairs.push([a, b]);
  return pairs;
}

export function RouteTable() {
  const { iatas, regionKey } = useRegion();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // drop the selection when the region changes — the selected route may not be in the new region
  const prevRegion = useRef(regionKey);
  useEffect(() => {
    if (prevRegion.current !== regionKey) {
      prevRegion.current = regionKey;
      setSelectedKey(null);
    }
  }, [regionKey]);

  // path search form: source→dest hashes, scoped to a multi-select of IATAs. One IATA → within-IATA
  // /routes/search; two+ → /routes/cross across the directed pairs. Hashes + ≥1 IATA required.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchIatas, setSearchIatas] = useState<string[]>([]);
  const [search, setSearch] = useState<SearchParams | null>(null);
  const isCross = search != null && search.iatas.length >= 2;

  // /routes filters by a single IATA only, so when the region resolves to exactly one IATA push the
  // filter to the server for true server-side paging; otherwise page unfiltered and filter the region
  // client-side below (a region can span several IATAs, which the endpoint can't express).
  const serverIata = iatas && iatas.length === 1 ? iatas[0] : undefined;

  // Page the route set on demand (50 at a time, cursor = last route's lastSeen ms) — the DataTable
  // pulls the next page via loadMore() as you scroll, instead of eagerly loading the whole set.
  const { items: listRoutes, loadedCount, isPaging, isError, isLoading: listLoading, loadMore, hasMore } =
    useInfinitePages<KnownRoute>({
      queryKey: ["routes", serverIata ?? ""],
      queryFn: (cursor) => getKnownRoutesPage({ iata: serverIata, cursor }),
      getId: routeId,
      keepPrevious: true,
      auto: false,
    });

  const { data: searchRoutes, isLoading: searchLoading } = useQuery({
    queryKey: ["routes-search", search?.iatas[0], search?.from, search?.to],
    queryFn: () => searchKnownRoutes(search!.iatas[0]!, search!.from, search!.to),
    enabled: search !== null && !isCross,
    staleTime: 60_000,
  });

  const { data: crossRoutes, isLoading: crossLoading } = useQuery({
    queryKey: ["routes-cross", [...(search?.iatas ?? [])].sort().join(","), search?.from, search?.to],
    queryFn: async () => {
      const results = await Promise.all(
        directedPairs(search!.iatas).map(([a, b]) => searchCrossIATARoutes(search!.from, a, search!.to, b)),
      );
      return results.flat();
    },
    enabled: search !== null && isCross,
    staleTime: 60_000,
  });

  // IATA options for the path-search multi-select, from /iatas (shares the region picker's cached
  // query). The label carries the display name so the dropdown's search filter matches on it.
  const { data: iataCodes } = useQuery({
    queryKey: ["iatas"],
    queryFn: getIatas,
    staleTime: 5 * 60_000,
  });
  const iataOptions = useMemo(
    () => (iataCodes ?? []).map((i) => ({ value: i.iata, label: i.displayName ? `${i.iata} — ${i.displayName}` : i.iata })),
    [iataCodes],
  );

  // searching shows the server's matches as-is; otherwise show the region-filtered full list (empty
  // region = all). Filtering by IATA stays client-side, consistent with the other tabs.
  const rows = useMemo(() => {
    if (search) return isCross ? [] : searchRoutes;
    if (!iatas || iatas.length === 0) return listRoutes;
    const set = new Set(iatas);
    return listRoutes.filter((r) => set.has(r.iata));
  }, [search, isCross, searchRoutes, listRoutes, iatas]);

  const selectedRoute = useMemo(
    () => rows?.find((r) => String(r.id) === selectedKey),
    [rows, selectedKey],
  );

  // A multi-IATA region filters globally-paged rows client-side, so the filtered list can be too
  // short to ever trigger scroll paging — or empty, with the region's routes deeper in the cursor
  // stream. Keep pulling pages until there's a screenful or the cap says the region is just sparse.
  useEffect(() => {
    if (search || serverIata || !iatas?.length) return;
    if (!hasMore || isPaging) return;
    if ((rows?.length ?? 0) >= 50 || loadedCount >= 1000) return;
    loadMore();
  }, [search, serverIata, iatas, hasMore, isPaging, rows, loadedCount, loadMore]);

  const canSearch = !!(from.trim() && to.trim() && searchIatas.length >= 1);
  // clear any selection when the visible list changes out from under it (search submit/clear)
  const submitSearch = useCallback(() => {
    if (!from.trim() || !to.trim() || searchIatas.length < 1) return;
    setSearch({ from: from.trim(), to: to.trim(), iatas: searchIatas });
    setSelectedKey(null);
  }, [from, to, searchIatas]);
  const clearSearch = useCallback(() => {
    setSearch(null);
    setSelectedKey(null);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submitSearch();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* stacks into two rows on mobile (the inputs would otherwise wrap around the arrow); one row at md+ */}
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-1.5 gap-y-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted text-[11px] uppercase tracking-wider mr-1 shrink-0">Find path</span>
          <input
            className={`${inputClass} flex-1 min-w-0 md:flex-none md:w-24`}
            placeholder="from hash"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="text-text-dim text-xs shrink-0" aria-hidden>→</span>
          <input
            className={`${inputClass} flex-1 min-w-0 md:flex-none md:w-24`}
            placeholder="to hash"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <MultiSelectDropdown
            label="IATA"
            options={iataOptions}
            selected={searchIatas}
            onChange={setSearchIatas}
            align="left"
          />
          <button
            type="button"
            onClick={submitSearch}
            disabled={!canSearch}
            className="text-[11px] font-mono px-2 py-1 rounded-sm border border-border bg-bg-surface text-text-normal hover:border-primary-dim disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={clearSearch}
              className="text-[11px] font-mono px-2 py-1 rounded-sm text-text-dim hover:text-text-normal cursor-pointer transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {isCross ? (
          <div className="flex-1 min-w-0 overflow-y-auto p-3 flex flex-col gap-2">
            {crossLoading ? (
              <div className="font-mono text-[13px] text-text-dim">Searching…</div>
            ) : crossRoutes && crossRoutes.length > 0 ? (
              crossRoutes.map((r, i) => <CrossRouteCard key={i} route={r} />)
            ) : (
              <div className="font-mono text-[13px] text-text-dim">No cross-IATA routes</div>
            )}
          </div>
        ) : (
          <div className="relative flex-1 min-w-0 flex flex-col min-h-0">
            <DataTable
              columns={COLUMNS}
              rows={rows}
              rowKey={(r) => String(r.id)}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              isLoading={search ? searchLoading : listLoading}
              emptyLabel={search ? "No matching routes" : "No routes"}
              defaultSort={{ header: "Last seen", direction: "desc" }}
              onEndReached={search ? undefined : loadMore}
              renderCard={renderRouteCard}
            />
            {!search && (
              <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun="routes" position="bottom-3 right-3" />
            )}
          </div>
        )}
        {selectedRoute && (
          <RouteDetailPanel route={selectedRoute} onClose={() => setSelectedKey(null)} />
        )}
      </div>
    </div>
  );
}
