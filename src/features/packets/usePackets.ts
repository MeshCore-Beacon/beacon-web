import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getPackets } from "../../api/client";
import { isRateLimited } from "../../api/rate-limit";
import { fetchPage, nextPageParam } from "../../api/paging";
import { useRegion } from "../../hooks/useRegion";
import type { WsPacketObservation, WsLagged } from "../../types/ws";
import type { CursorPage, PacketSummary, PageParam } from "../../types/api";
import type { PacketServerFilter } from "./types";
import { LIVE_BUFFER_CAP } from "../../lib/constants";

// merge and deduplicate live + paginated packets

function flattenPages(data: { pages: Array<{ items: PacketSummary[] }> } | undefined): PacketSummary[] {
  if (!data) return [];
  return data.pages.flatMap((p) => p.items);
}

function dedup(packets: PacketSummary[]): PacketSummary[] {
  const seen = new Set<string>();
  return packets.filter((p) => {
    if (seen.has(p.packetHash)) return false;
    seen.add(p.packetHash);
    return true;
  });
}

interface LiveSnapshot {
  buffer: readonly PacketSummary[];
  acknowledgedCount: number;
  observersByHash: ReadonlyMap<string, ReadonlySet<string>>;
}

// RAF batching avoids re-rendering on every WS message -- can be 50+/sec during floods

class LivePacketStore {
  private buffer: PacketSummary[] = [];
  private hashIndex = new Map<string, number>();
  private observersByHash = new Map<string, Set<string>>();
  private acknowledgedCount = 0;
  private snapshot: LiveSnapshot = { buffer: [], acknowledgedCount: 0, observersByHash: new Map() };
  private listeners = new Set<() => void>();
  private rafId: number | null = null;
  // bumped by reset(), so work started for one region can tell it has been overtaken
  generation = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LiveSnapshot => {
    return this.snapshot;
  };

  private scheduleNotify(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.snapshot = { buffer: this.buffer, acknowledgedCount: this.acknowledgedCount, observersByHash: this.observersByHash };
      for (const l of this.listeners) l();
    });
  }

  pushOrUpdate(summary: PacketSummary): void {
    if (summary.latestObserver) {
      const observers = this.observersByHash.get(summary.packetHash);
      if (observers) {
        observers.add(summary.latestObserver.id);
      } else {
        this.observersByHash.set(summary.packetHash, new Set([summary.latestObserver.id]));
      }
    }

    const existing = this.hashIndex.get(summary.packetHash);
    if (existing !== undefined) {
      // A WS message only knows its own heardAt, so widen the window rather than replacing it —
      // otherwise the expanded row's spread reads 0 for every re-heard packet.
      const prev = this.buffer[existing]!;
      this.buffer = [...this.buffer];
      this.buffer[existing] = {
        ...summary,
        firstHeardAt: Math.min(prev.firstHeardAt, summary.firstHeardAt),
        lastHeardAt: Math.max(prev.lastHeardAt, summary.lastHeardAt),
      };
    } else {
      this.buffer = [summary, ...this.buffer];
      this.rebuildIndex();
      if (this.buffer.length > LIVE_BUFFER_CAP) {
        // TODO: this splice mutates in-place after the spread copy above -- fine for now but sloppy
        const removed = this.buffer.splice(LIVE_BUFFER_CAP);
        for (const p of removed) {
          this.hashIndex.delete(p.packetHash);
          this.observersByHash.delete(p.packetHash);
        }
      }
    }
    this.scheduleNotify();
  }

  has(packetHash: string): boolean {
    return this.hashIndex.has(packetHash);
  }

  private rebuildIndex(): void {
    this.hashIndex.clear();
    for (let i = 0; i < this.buffer.length; i++) {
      this.hashIndex.set(this.buffer[i]!.packetHash, i);
    }
  }

  acknowledge(): void {
    this.acknowledgedCount = this.buffer.length;
    this.snapshot = { buffer: this.buffer, acknowledgedCount: this.acknowledgedCount, observersByHash: this.observersByHash };
    for (const l of this.listeners) l();
  }

  reset(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.generation++;
    this.buffer = [];
    this.hashIndex.clear();
    this.observersByHash.clear();
    this.acknowledgedCount = 0;
    this.snapshot = { buffer: [], acknowledgedCount: 0, observersByHash: new Map() };
  }
}

// combines live WS stream with paginated history

export function usePackets(frozen: boolean = false, serverFilter: PacketServerFilter | null = null) {
  const { iatas, regionKey, isResolved } = useRegion();
  const pending = isResolved === false;
  const queryClient = useQueryClient();
  const [store] = useState(() => new LivePacketStore());
  const [laggedCount, setLaggedCount] = useState(0);

  const [prevRegionKey, setPrevRegionKey] = useState(regionKey);
  const regionChanged = prevRegionKey !== regionKey;
  if (regionChanged) {
    setPrevRegionKey(regionKey);
    store.reset();
    setLaggedCount(0);
  }

  const { buffer: liveBuffer, acknowledgedCount, observersByHash } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );

  // While scrolled away from the top, render a latched buffer so live prepends don't shift the
  // view; the held packets reveal when the user returns to the top. Latched by holding the last
  // value (set-state-during-render, this file's pattern — cf. prevRegionKey above). The
  // regionChanged guard drops the latch so a region switch never shows the previous region.
  const [displayBuffer, setDisplayBuffer] = useState(liveBuffer);
  if ((!frozen || regionChanged) && displayBuffer !== liveBuffer) {
    setDisplayBuffer(liveBuffer);
  }

  const handlePacketObservation = useCallback(
    (data: WsPacketObservation["data"]) => {
      // the previous region's subscription can still deliver after the buffer reset
      if (iatas && !iatas.includes(data.observation.iata)) return;
      const summary: PacketSummary = {
        packetHash: data.packetHash,
        payloadType: data.packet.payloadType,
        payloadTypeName: data.packet.payloadTypeName,
        routeType: data.packet.routeType,
        routeTypeName: data.packet.routeTypeName,
        firstHeardAt: data.observation.heardAt,
        lastHeardAt: data.observation.heardAt,
        observationCount: data.packet.observationCount,
        scope: data.packet.scope,
        summary: data.packet.summary,
        latestObserver: {
          id: data.observation.observerId,
          displayName: data.observation.observerName,
          iata: data.observation.iata,
          pathLength: data.observation.pathLength,
          pathBytes: data.observation.pathBytes,
          // WS nulls these when the payload type carries no endpoint; the REST shape uses undefined
          resolvedSource: data.observation.resolvedSource ?? undefined,
          resolvedDestination: data.observation.resolvedDestination ?? undefined,
        },
      };

      store.pushOrUpdate(summary);
    },
    [store, iatas],
  );

  // One request per notice, never an invalidate: that replays every cached page, up to 20 requests
  // during a flood. When the newest page overlaps the list, the missed packets go in through the
  // live buffer, so loaded pages and the scroll position stay; otherwise it alone becomes the list.
  const handleLagged = useCallback(
    async (data: WsLagged): Promise<void> => {
      setLaggedCount((prev) => prev + data.droppedCount);
      // while the API is throttling us the refetch would only 429; the next lag notice or remount heals it
      if (isRateLimited()) return;
      const key = serverFilter ? ["packets", regionKey, serverFilter] : ["packets", regionKey];
      const cached = queryClient.getQueryData<InfiniteData<CursorPage<PacketSummary>>>(key);
      if (!cached?.pages.length) {
        await queryClient.resetQueries({ queryKey: ["packets", regionKey] });
        return;
      }
      const generation = store.generation;
      let newest: CursorPage<PacketSummary>;
      try {
        newest = await getPackets(iatas, { ...serverFilter });
      } catch {
        return; // keep what is shown; the next notice or remount heals the gap
      }
      if (store.generation !== generation) return;
      const shown = new Set(flattenPages(cached).map((p) => p.packetHash));
      const known = (p: PacketSummary) => shown.has(p.packetHash) || store.has(p.packetHash);
      if (newest.items.some(known)) {
        for (const p of [...newest.items].reverse()) if (!known(p)) store.pushOrUpdate(p);
      } else {
        queryClient.setQueryData<InfiniteData<CursorPage<PacketSummary>>>(key, { pages: [newest], pageParams: [undefined] });
      }
      // other filter variants of this region can't be patched, so they start over when next shown
      const active = JSON.stringify(key);
      await queryClient.resetQueries({ queryKey: ["packets", regionKey], predicate: (q) => JSON.stringify(q.queryKey) !== active });
    },
    [queryClient, regionKey, serverFilter, iatas, store],
  );

  // The WS handler is down whenever this tab is unmounted, so cached history may hide a gap right
  // where the live buffer begins. Refresh the first page on mount to close it (prefix match:
  // filtered variants included).
  useEffect(() => {
    queryClient.resetQueries({ queryKey: ["packets", regionKey] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only; region changes refetch via the key
  }, []);

  const dismissLagged = useCallback(() => setLaggedCount(0), []);

  const {
    data: history,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    // The unfiltered key must stay 2-element so its cached entry survives filter toggling; the
    // lagged/mount resets above match both shapes by prefix.
    queryKey: serverFilter ? ["packets", regionKey, serverFilter] : ["packets", regionKey],
    // first load and every scroll page are the default 50; getPackets fills in the limit
    queryFn: ({ pageParam }) =>
      fetchPage(pageParam, (page) => getPackets(iatas, { cursor: page?.cursor, pageCursor: page?.pageCursor, ...serverFilter })),
    getNextPageParam: nextPageParam,
    initialPageParam: undefined as PageParam<number> | undefined,
    staleTime: Infinity,
    enabled: !pending,
  });

  const allPackets = useMemo(
    () => dedup([...displayBuffer, ...flattenPages(history)]),
    [displayBuffer, history],
  );

  const observerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPackets) {
      if (p.latestObserver && !map.has(p.latestObserver.id)) {
        map.set(p.latestObserver.id, p.latestObserver.displayName ?? p.latestObserver.id.slice(0, 8));
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allPackets]);

  const newPacketCount = liveBuffer.length - acknowledgedCount;

  const acknowledgeNewPackets = useCallback(() => {
    store.acknowledge();
  }, [store]);

  return {
    allPackets,
    observerOptions,
    newPacketCount,
    acknowledgeNewPackets,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetching,
    isFetchingNextPage,
    isLoading: isLoading || pending,
    isError,
    refetch,
    observersByHash,
    handlePacketObservation,
    handleLagged,
    laggedCount,
    dismissLagged,
  };
}
