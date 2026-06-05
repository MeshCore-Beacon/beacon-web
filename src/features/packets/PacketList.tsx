import { useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { usePackets } from "./usePackets";
import { usePacketFilters, matchesFilters } from "./usePacketFilters";
import { useScopes } from "../../hooks/useScopes";
import { useWsPacketHandler, useWsLaggedHandler } from "../../hooks/useWsHandlers";
import { PacketVirtualList } from "./PacketVirtualList";
import { FilterBar } from "../../components/FilterBar";
import { PAYLOAD_TYPE_NAMES, ROUTE_TYPE_NAMES } from "../../types/enums";
import type { WsManager } from "../../api/ws-manager";

// filter options and storage keys

const TYPE_OPTIONS = Object.entries(PAYLOAD_TYPE_NAMES).map(([value, label]) => ({
  value: String(value),
  label,
}));

const ROUTE_OPTIONS = Object.entries(ROUTE_TYPE_NAMES).map(([value, label]) => ({
  value: String(value),
  label,
}));

interface PacketListProps {
  wsManager: WsManager;
  onAnalyze: (hash: string | null) => void;
}

// main packet view: filters, banner, virtual list

export function PacketList({ wsManager, onAnalyze }: PacketListProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { filters, setFilter, setSearch, setSearchField, clearFilters } = usePacketFilters();
  const scopeNames = useScopes();
  const scopeOptions = useMemo(() => scopeNames.map((s) => ({ value: s, label: s })), [scopeNames]);
  const {
    allPackets,
    observerOptions,
    newPacketCount,
    acknowledgeNewPackets,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    observersByHash,
    handlePacketObservation,
    handleLagged,
    laggedCount,
    dismissLagged,
  } = usePackets();

  const packets = useMemo(
    () => allPackets.filter((p) => matchesFilters(p, filters, observersByHash)),
    [allPackets, filters, observersByHash],
  );

  const [isScrolledAway, setIsScrolledAway] = useState(false);
  const scrollToTopRef = useRef<(() => void) | null>(null);

  const [expandedHash, setExpandedHash] = useState<string | null>(() => searchParams.get("hash"));

  const handleToggleExpand = useCallback((hash: string) => {
    const next = expandedHash === hash ? null : hash;
    setExpandedHash(next);
    onAnalyze(next);
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (next) n.set("hash", next); else n.delete("hash");
      return n;
    }, { replace: true });
  }, [expandedHash, setSearchParams, onAnalyze]);

  useWsPacketHandler(wsManager, handlePacketObservation);
  useWsLaggedHandler(wsManager, handleLagged);

  const bannerCount = isScrolledAway ? newPacketCount : 0;

  const handleScrolledAway = useCallback(
    (isAway: boolean) => {
      setIsScrolledAway(isAway);
      if (!isAway) acknowledgeNewPackets();
    },
    [acknowledgeNewPackets],
  );

  const handleScrollToTop = useCallback(() => {
    scrollToTopRef.current?.();
    acknowledgeNewPackets();
  }, [acknowledgeNewPackets]);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <FilterBar
          typeOptions={TYPE_OPTIONS}
          routeOptions={ROUTE_OPTIONS}
          observerOptions={observerOptions}
          scopeOptions={scopeOptions}
          activeTypes={filters.payloadTypes.map(String)}
          activeRoutes={filters.routeTypes.map(String)}
          activeObservers={filters.observers}
          activeScopes={filters.scopes}
          onTypesChange={(v) => setFilter("payloadTypes", v.map(Number))}
          onRoutesChange={(v) => setFilter("routeTypes", v.map(Number))}
          onObserversChange={(v) => setFilter("observers", v)}
          onScopesChange={(v) => setFilter("scopes", v)}
          search={filters.search}
          onSearchChange={setSearch}
          searchField={filters.searchField}
          onSearchFieldChange={setSearchField}
          onClear={clearFilters}
        />

        {laggedCount > 0 && (
          <div className="mx-4 px-3 py-1.5 bg-warn/6 border border-warn/12 text-warn text-xs font-medium font-mono rounded-b flex items-center justify-between">
            <span>{laggedCount} packet{laggedCount === 1 ? "" : "s"} dropped — data may be incomplete</span>
            <button type="button" className="underline cursor-pointer" onClick={dismissLagged}>dismiss</button>
          </div>
        )}

        {bannerCount > 0 ? (
          <button
            type="button"
            className="mx-4 flex items-center justify-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/15 border border-primary/20 border-t-0 text-primary text-[11px] font-medium tracking-wide cursor-pointer font-mono rounded-b transition-colors"
            onClick={handleScrollToTop}
          >
            <span aria-hidden>▲</span>
            {bannerCount} new packet{bannerCount === 1 ? "" : "s"}
            <span className="text-primary/60 font-normal">· scroll to top</span>
          </button>
        ) : (
          <div className="mx-4 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary/8 border border-primary/15 border-t-0 text-primary text-[11px] font-medium tracking-wide font-mono rounded-b">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Live Packets
          </div>
        )}

        <PacketVirtualList
          packets={packets}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          onScrollAwayFromTop={handleScrolledAway}
          scrollToTopRef={scrollToTopRef}
          expandedHash={expandedHash}
          onToggleExpand={handleToggleExpand}
        />
      </div>
    </div>
  );
}
