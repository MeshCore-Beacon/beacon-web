import { useSearchParams } from "react-router-dom";
import { useMemo, useCallback } from "react";
import type { PacketFilterState, SearchField } from "./types";
import type { PacketSummary } from "../../types/api";
import type { PayloadTypeValue, RouteTypeValue } from "../../types/enums";

// filter state synced to URL search params

function parseIntArray(value: string | null): number[] {
  if (!value) return [];
  return value.split(",").map(Number).filter(Number.isFinite);
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

const VALID_SEARCH_FIELDS = new Set<SearchField>(["hash", "path", "payload"]);

function parseSearchField(value: string | null): SearchField {
  if (value && VALID_SEARCH_FIELDS.has(value as SearchField)) return value as SearchField;
  return "hash";
}

export function usePacketFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: PacketFilterState = useMemo(
    () => ({
      payloadTypes: parseIntArray(searchParams.get("types")) as PayloadTypeValue[],
      routeTypes: parseIntArray(searchParams.get("routes")) as RouteTypeValue[],
      observers: parseStringArray(searchParams.get("obs")),
      search: searchParams.get("q") ?? "",
      searchField: parseSearchField(searchParams.get("sf")),
    }),
    [searchParams],
  );

  const setFilter = useCallback(
    (key: "payloadTypes" | "routeTypes" | "observers", values: (number | string)[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const paramKey = key === "payloadTypes" ? "types" : key === "routeTypes" ? "routes" : "obs";
          if (values.length === 0) {
            next.delete(paramKey);
          } else {
            next.set(paramKey, values.join(","));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setSearch = useCallback(
    (query: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (query) {
            next.set("q", query);
          } else {
            next.delete("q");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setSearchField = useCallback(
    (field: SearchField) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (field === "hash") {
            next.delete("sf");
          } else {
            next.set("sf", field);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("types");
        next.delete("routes");
        next.delete("obs");
        next.delete("q");
        next.delete("sf");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { filters, setFilter, setSearch, setSearchField, clearFilters };
}

// client-side filter predicate for packet rows

export function matchesFilters(
  packet: PacketSummary,
  filters: PacketFilterState,
  observersByHash?: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  if (filters.payloadTypes.length > 0 && !filters.payloadTypes.includes(packet.payloadType as PayloadTypeValue)) {
    return false;
  }
  if (filters.routeTypes.length > 0 && !filters.routeTypes.includes(packet.routeType as RouteTypeValue)) {
    return false;
  }
  if (filters.observers.length > 0) {
    const known = observersByHash?.get(packet.packetHash);
    const match = known
      ? filters.observers.some((id) => known.has(id))
      : filters.observers.includes(packet.latestObserver.id);
    if (!match) return false;
  }
  if (filters.search && filters.searchField === "hash") {
    const q = filters.search.toLowerCase();
    if (!packet.packetHash.toLowerCase().includes(q)) {
      return false;
    }
  }
  return true;
}
