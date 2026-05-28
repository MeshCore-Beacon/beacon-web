import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getPackets } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import type { WsPacketObservation, WsLagged } from "../../types/ws";
import type { PacketSummary } from "../../types/api";
import { ROUTE_TYPE_NAMES, type RouteTypeValue } from "../../types/enums";
import { LIVE_BUFFER_CAP, MAX_INFINITE_PAGES } from "../../lib/constants";

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
    const observers = this.observersByHash.get(summary.packetHash);
    if (observers) {
      observers.add(summary.latestObserver.id);
    } else {
      this.observersByHash.set(summary.packetHash, new Set([summary.latestObserver.id]));
    }

    const existing = this.hashIndex.get(summary.packetHash);
    if (existing !== undefined) {
      this.buffer = [...this.buffer];
      this.buffer[existing] = summary;
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
    this.buffer = [];
    this.hashIndex.clear();
    this.observersByHash.clear();
    this.acknowledgedCount = 0;
    this.snapshot = { buffer: [], acknowledgedCount: 0, observersByHash: new Map() };
  }
}

// combines live WS stream with paginated history

export function usePackets() {
  const region = useRegion();
  const queryClient = useQueryClient();
  const [store] = useState(() => new LivePacketStore());
  const [laggedCount, setLaggedCount] = useState(0);

  const [prevRegion, setPrevRegion] = useState(region);
  if (prevRegion !== region) {
    setPrevRegion(region);
    store.reset();
    setLaggedCount(0);
  }

  const { buffer: liveBuffer, acknowledgedCount, observersByHash } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );

  const handlePacketObservation = useCallback(
    (data: WsPacketObservation["data"]) => {
      const summary: PacketSummary = {
        packetHash: data.packetHash,
        payloadType: data.packet.payloadType,
        payloadTypeName: data.packet.payloadTypeName,
        routeType: data.packet.routeType,
        routeTypeName: ROUTE_TYPE_NAMES[data.packet.routeType as RouteTypeValue] ?? "Unknown",
        firstHeardAt: data.observation.heardAt,
        lastHeardAt: data.observation.heardAt,
        observationCount: data.packet.totalObservationCount,
        latestObserver: {
          id: data.observation.observerId,
          displayName: data.observation.observerName,
          iata: data.observation.iata,
        },
        summary: data.packet.summary,
      };

      store.pushOrUpdate(summary);
    },
    [store],
  );

  const handleLagged = useCallback(
    (data: WsLagged) => {
      setLaggedCount((prev) => prev + data.droppedCount);
      queryClient.invalidateQueries({ queryKey: ["packets", region] });
    },
    [queryClient, region],
  );

  const dismissLagged = useCallback(() => setLaggedCount(0), []);

  const {
    data: history,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["packets", region],
    queryFn: ({ pageParam }) => getPackets(region, { cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
    initialPageParam: undefined as string | undefined,
    staleTime: Infinity,
    maxPages: MAX_INFINITE_PAGES,
  });

  const allPackets = useMemo(
    () => dedup([...liveBuffer, ...flattenPages(history)]),
    [liveBuffer, history],
  );

  const observerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allPackets) {
      if (!map.has(p.latestObserver.id)) {
        map.set(p.latestObserver.id, p.latestObserver.displayName);
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
    isFetchingNextPage,
    observersByHash,
    handlePacketObservation,
    handleLagged,
    laggedCount,
    dismissLagged,
  };
}
