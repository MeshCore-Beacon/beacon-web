import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { usePackets } from "./usePackets";
import { usePacketDetail } from "./usePacketDetail";
import { usePacketFilters, matchesFilters, toServerFilter } from "./usePacketFilters";
import { useScopes } from "../../hooks/useScopes";
import { useRegion } from "../../hooks/useRegion";
import { useWsPacketHandler, useWsLaggedHandler } from "../../hooks/useWsHandlers";
import { PacketVirtualList } from "./PacketVirtualList";
import { FilterBar } from "../../components/FilterBar";
import { LoadingPill } from "../../components/LoadingPill";
import { SkeletonRows } from "../../components/SkeletonRows";
import { CloseButton } from "../../components/CloseButton";
import { PAYLOAD_TYPE_NAMES, ROUTE_TYPE_NAMES } from "../../types/enums";
import type { WsManager } from "../../api/ws-manager";
import type { PacketDetail } from "../../types/api";
import type { WsPacketObservation } from "../../types/ws";

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
  onViewPath: (detail: PacketDetail) => void;
  selectedObservationId: number | null;
  onSelectObservation: (id: number) => void;
}

// main packet view: filters, banner, virtual list

export function PacketList({ wsManager, onAnalyze, onViewPath, selectedObservationId, onSelectObservation }: PacketListProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
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
    isLoading,
    isError,
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

  // ?hash is the selected packet — it expands the row inline. The analyzer is a separate state (?analyze=1).
  const expandedHash = searchParams.get("hash");

  const handleToggleExpand = useCallback((hash: string) => {
    const next = expandedHash === hash ? null : hash;
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      if (next) n.set("hash", next); else n.delete("hash");
      return n;
    }, { replace: true });
  }, [expandedHash, setSearchParams]);

  // Shared with the expanded row's own usePacketDetail, so reading it here costs no extra request.
  const { data: expandedDetail, isError: selectedError, error: detailError, refetch: retryDetail } = usePacketDetail(expandedHash);
  const detailStatus = detailError && "status" in detailError ? detailError.status : undefined;

  const handleOpenAnalyzer = useCallback(() => {
    if (expandedHash) onAnalyze(expandedHash);
  }, [expandedHash, onAnalyze]);

  const handleViewPath = useCallback(() => {
    if (expandedDetail) onViewPath(expandedDetail);
  }, [expandedDetail, onViewPath]);

  // Refetch only the open row's detail, so its observation table keeps pace with the count ticking
  // up beside it. Every other observation just lands in the list.
  const handleObservation = useCallback((data: WsPacketObservation["data"]) => {
    handlePacketObservation(data);
    if (data.packetHash === expandedHash) {
      queryClient.invalidateQueries({ queryKey: ["packet-detail", expandedHash] });
    }
  }, [handlePacketObservation, expandedHash, queryClient]);

  useWsPacketHandler(wsManager, handleObservation);
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
      <div className="relative flex flex-col flex-1 min-h-0 min-w-0">
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

        {/* A hash-only link still selects a row; offer the existing analyzer when there is no row. */}
        {expandedHash && !isLoading && searchParams.get("analyze") !== "1" && !packets.some(p => p.packetHash === expandedHash) && (
          <section aria-label="Selected packet" className="mx-4 my-2 px-3 py-2 border border-border rounded-sm bg-bg-surface flex items-start justify-between gap-3 text-xs text-text-muted">
            <div>
              {selectedError ? (
                <>
                  <p role="alert">{detailStatus === 400 ? "Invalid packet hash." : detailStatus === 404 ? "Packet not found." : "Failed to load selected packet."}</p>
                  <button type="button" className="mt-1 px-2 py-1 border border-border rounded-sm hover:bg-bg-raised cursor-pointer" onClick={() => retryDetail()} aria-label="Retry selected packet">Retry</button>
                </>
              ) : expandedDetail ? (
                <>
                  <p>Selected packet is outside the loaded results.</p>
                  <button type="button" className="mt-1 px-2 py-1 border border-border rounded-sm hover:bg-bg-raised cursor-pointer" onClick={handleOpenAnalyzer}>Open analyzer</button>
                </>
              ) : <p role="status">Loading selected packet…</p>}
            </div>
            <CloseButton label="Dismiss selected packet" onClose={() => handleToggleExpand(expandedHash)} />
          </section>
        )}

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

        {isLoading && packets.length === 0 ? (
          <SkeletonRows />
        ) : (
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
            onOpenAnalyzer={handleOpenAnalyzer}
            onViewPath={handleViewPath}
            selectedObservationId={selectedObservationId}
            onSelectObservation={onSelectObservation}
          />
        )}
        <LoadingPill
          loading={isLoading || isFetchingNextPage}
          error={isError}
          count={packets.length}
          noun="packets"
          position="bottom-3 right-3"
        />
      </div>
    </div>
  );
}
