import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { usePackets } from "./usePackets";
import { usePacketFilters, matchesFilters, toServerFilter } from "./usePacketFilters";
import { useScopes } from "../../hooks/useScopes";
import { useRegion } from "../../hooks/useRegion";
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
  // single-value selections go to the server so scrolling pages through matching history
  const serverFilter = useMemo(() => toServerFilter(filters), [filters]);
  const scopeNames = useScopes();
  const scopeOptions = useMemo(() => scopeNames.map((s) => ({ value: s, label: s })), [scopeNames]);
  const { regionKey } = useRegion();

  // isAtTop drives the freeze (list held static while scrolled off the very top); isScrolledAway
  // (a wider deadband) drives the banner. listResetKey remounts the list to reveal held packets.
  const [isScrolledAway, setIsScrolledAway] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [listResetKey, setListResetKey] = useState(0);

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
  } = usePackets(!isAtTop, serverFilter);

  const packets = useMemo(
    () => allPackets.filter((p) => matchesFilters(p, filters, observersByHash)),
    [allPackets, filters, observersByHash],
  );

  // ?hash is the source of truth — the analyzer drawer clears it on close, deselecting the row
  const expandedHash = searchParams.get("hash");

  const handleToggleExpand = useCallback((hash: string) => {
    const next = expandedHash === hash ? null : hash;
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

  // Remount the list (fresh at the top, no stale scroll anchor for the virtualizer to preserve)
  // when returning to the top with packets held while away — a big prepend into the live list
  // would otherwise keep the old row anchored instead of landing on the newest.
  const [prevAtTop, setPrevAtTop] = useState(isAtTop);
  if (prevAtTop !== isAtTop) {
    setPrevAtTop(isAtTop);
    if (isAtTop && newPacketCount > 0) setListResetKey((k) => k + 1);
  }

  // A region switch starts fresh at the top so the new region's list isn't held frozen.
  const [prevRegionKey, setPrevRegionKey] = useState(regionKey);
  if (prevRegionKey !== regionKey) {
    setPrevRegionKey(regionKey);
    setListResetKey((k) => k + 1);
    setIsAtTop(true);
    setIsScrolledAway(false);
  }

  // At the top the held packets are revealed, so acknowledge continuously there — the banner then
  // counts only what arrived while the user was away (and never flashes a count at the top).
  useEffect(() => {
    if (isAtTop && newPacketCount > 0) acknowledgeNewPackets();
  }, [isAtTop, newPacketCount, acknowledgeNewPackets]);

  // Returning to the top (revealing held packets) is a remount; releasing the freeze first lets
  // the fresh list mount with the newest packet already in place.
  const handleScrollToTop = useCallback(() => {
    setIsScrolledAway(false);
    setIsAtTop(true);
  }, []);

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
          key={listResetKey}
          packets={packets}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          onScrollAwayFromTop={setIsScrolledAway}
          onAtTopChange={setIsAtTop}
          expandedHash={expandedHash}
          onToggleExpand={handleToggleExpand}
        />
      </div>
    </div>
  );
}
