import { useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { usePackets } from "./usePackets";
import { usePacketFilters, matchesFilters } from "./usePacketFilters";
import { useWsPacketHandler, useWsLaggedHandler } from "../../hooks/useWsHandlers";
import { PacketVirtualList } from "./PacketVirtualList";
import { PacketAnalyzerDrawer } from "./PacketAnalyzerDrawer";
import { FilterBar } from "../../components/FilterBar";
import { getPacketDetail } from "../../api/client";
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

const DRAWER_STORAGE_KEY = "tower-analyzer-open";

// main packet view: filters, banner, virtual list, analyzer

export function PacketList({ wsManager }: { wsManager: WsManager }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { filters, setFilter, setSearch, setSearchField, clearFilters } = usePacketFilters();
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
  const [selectedObservationId, setSelectedObservationId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(() => {
    const stored = localStorage.getItem(DRAWER_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });

  const expandedPacket = packets.find((p) => p.packetHash === expandedHash);

  const { data: expandedDetail } = useQuery({
    queryKey: ["packet-detail", expandedHash, expandedPacket?.observationCount],
    queryFn: () => getPacketDetail(expandedHash!),
    enabled: !!expandedHash,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  const handleToggleExpand = useCallback((hash: string) => {
    setExpandedHash((prev) => {
      const next = prev === hash ? null : hash;
      setSelectedObservationId(null);
      setSearchParams((p) => {
        const n = new URLSearchParams(p);
        if (next) n.set("hash", next); else n.delete("hash");
        return n;
      }, { replace: true });
      return next;
    });
  }, [setSearchParams]);

  const handleToggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => {
      const next = !prev;
      localStorage.setItem(DRAWER_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

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
          activeTypes={filters.payloadTypes.map(String)}
          activeRoutes={filters.routeTypes.map(String)}
          activeObservers={filters.observers}
          onTypesChange={(v) => setFilter("payloadTypes", v.map(Number))}
          onRoutesChange={(v) => setFilter("routeTypes", v.map(Number))}
          onObserversChange={(v) => setFilter("observers", v)}
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

        {bannerCount > 0 && (
          <button
            type="button"
            className="mx-4 px-3 py-1.5 bg-primary/6 border border-primary/12 border-t-0 text-primary text-xs font-medium text-center cursor-pointer font-mono rounded-b"
            onClick={handleScrollToTop}
          >
            ▲ {bannerCount} new packet{bannerCount === 1 ? "" : "s"} · click to scroll to top
          </button>
        )}

        <PacketVirtualList
          packets={packets}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          fetchNextPage={fetchNextPage}
          onScrollAwayFromTop={handleScrolledAway}
          scrollToTopRef={scrollToTopRef}
          expandedHash={expandedHash}
          expandedDetail={expandedDetail}
          onToggleExpand={handleToggleExpand}
          selectedObservationId={selectedObservationId}
          onSelectObservation={setSelectedObservationId}
        />
      </div>

      <PacketAnalyzerDrawer
        detail={expandedDetail}
        selectedObservationId={selectedObservationId}
        open={drawerOpen}
        onToggle={handleToggleDrawer}
      />
    </div>
  );
}
