import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getKnownRoutesPage, searchKnownRoutes, getIatas } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { DataTable, type Column } from "../../components/DataTable";
import { LoadingPill } from "../../components/LoadingPill";
import { SelectDropdown } from "../../components/SelectDropdown";
import { RouteDetailPanel } from "./RouteDetailPanel";
import { ResolvedHopBlock } from "../packets/PathData";
import type { KnownRoute, ResolvedHop } from "../../types/api";

const inputClass =
  "text-[11px] font-mono bg-bg-surface border border-border rounded-sm px-2 py-1 text-text-bright " +
  "placeholder:text-text-dim transition-colors";

// stable id accessor for the paginator's dedup (module-level so the memo isn't rebuilt each render)
const routeId = (r: KnownRoute) => String(r.id);

// A known route's ordered hops as a hash chain, reusing the packet path renderer's hop block. Hops are
// high-confidence by definition; the node popover lights up if/when the server populates hop.node.
// Memoized: the route's identity is stable across the 10s ticks from the <Timestamp> cells, so the hop
// chain (and its popovers) don't re-reconcile just to refresh the relative timestamps in other columns.
const RouteHopChain = memo(function RouteHopChain({ route }: { route: KnownRoute }) {
  return (
    <div className="flex flex-wrap items-center gap-1 font-mono text-[13px]">
      {route.hops.map((hop, i) => {
        const resolved: ResolvedHop = { confidence: "high", nodes: hop.node ? [hop.node] : [] };
        return (
          <span key={i} className="contents">
            {i > 0 && <span className="text-text-dim" aria-hidden>→</span>}
            <ResolvedHopBlock hop={resolved} label={hop.hashBytes.toUpperCase()} />
          </span>
        );
      })}
    </div>
  );
});

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

  // path search form (all three fields required by the server)
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchIata, setSearchIata] = useState("");
  const [search, setSearch] = useState<{ iata: string; from: string; to: string } | null>(null);

  // /routes filters by a single IATA only, so when the region resolves to exactly one IATA push the
  // filter to the server for true server-side paging; otherwise page unfiltered and filter the region
  // client-side below (a region can span several IATAs, which the endpoint can't express).
  const serverIata = iatas && iatas.length === 1 ? iatas[0] : undefined;

  // Page the route set on demand (50 at a time, cursor = last route's lastSeen ms) — the DataTable
  // pulls the next page via loadMore() as you scroll, instead of eagerly loading the whole set.
  const { items: listRoutes, loadedCount, isPaging, isError, isLoading: listLoading, loadMore } =
    useInfinitePages<KnownRoute>({
      queryKey: ["routes", serverIata ?? ""],
      queryFn: (cursor) => getKnownRoutesPage({ iata: serverIata, cursor }),
      getId: routeId,
      keepPrevious: true,
      auto: false,
    });

  const { data: searchRoutes, isLoading: searchLoading } = useQuery({
    queryKey: ["routes-search", search?.iata, search?.from, search?.to],
    queryFn: () => searchKnownRoutes(search!.iata, search!.from, search!.to),
    enabled: search !== null,
    staleTime: 60_000,
  });

  // IATA options for the path-search dropdown, from /iatas (shares the region picker's cached query).
  const { data: iataCodes } = useQuery({
    queryKey: ["iatas"],
    queryFn: getIatas,
    staleTime: 5 * 60_000,
  });
  const iataOptions = useMemo(
    () => (iataCodes ?? []).map((i) => ({
      value: i.iata,
      label: i.displayName ? `${i.iata} — ${i.displayName}` : i.iata,
    })),
    [iataCodes],
  );

  // searching shows the server's matches as-is; otherwise show the region-filtered full list (empty
  // region = all). Filtering by IATA stays client-side, consistent with the other tabs.
  const rows = useMemo(() => {
    if (search) return searchRoutes;
    if (!iatas || iatas.length === 0) return listRoutes;
    const set = new Set(iatas);
    return listRoutes.filter((r) => set.has(r.iata));
  }, [search, searchRoutes, listRoutes, iatas]);

  const selectedRoute = useMemo(
    () => rows?.find((r) => String(r.id) === selectedKey),
    [rows, selectedKey],
  );

  const canSearch = !!(from.trim() && to.trim() && searchIata);
  // clear any selection when the visible list changes out from under it (search submit/clear)
  const submitSearch = useCallback(() => {
    if (!from.trim() || !to.trim() || !searchIata) return;
    setSearch({ iata: searchIata, from: from.trim(), to: to.trim() });
    setSelectedKey(null);
  }, [from, to, searchIata]);
  const clearSearch = useCallback(() => {
    setSearch(null);
    setSelectedKey(null);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submitSearch();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0">
        <span className="text-text-muted text-[11px] uppercase tracking-wider mr-1">Find path</span>
        <input
          className={`${inputClass} w-28`}
          placeholder="from hash"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className="text-text-dim text-xs" aria-hidden>→</span>
        <input
          className={`${inputClass} w-28`}
          placeholder="to hash"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <SelectDropdown
          label="in"
          options={iataOptions}
          value={searchIata}
          onChange={setSearchIata}
          align="left"
          allLabel="IATA"
          hideAll
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

      <div className="flex flex-1 min-h-0">
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
          />
          {!search && (
            <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun="routes" position="bottom-3 right-3" />
          )}
        </div>
        {selectedRoute && (
          <RouteDetailPanel route={selectedRoute} onClose={() => setSelectedKey(null)} />
        )}
      </div>
    </div>
  );
}
