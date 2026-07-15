import { useSearchParams } from "react-router-dom";
import { useMemo, useCallback } from "react";
import type { PacketFilterState, PacketServerFilter, SearchField } from "./types";
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

// "path"/"payload" show as disabled placeholders in the filter bar — matchesFilters only
// implements hash, so don't accept them from the URL either or the search silently does nothing
const IMPLEMENTED_SEARCH_FIELDS = new Set<SearchField>(["hash"]);

function parseSearchField(value: string | null): SearchField {
  if (value && IMPLEMENTED_SEARCH_FIELDS.has(value as SearchField)) return value as SearchField;
  return "hash";
}

export function usePacketFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: PacketFilterState = useMemo(
    () => ({
      payloadTypes: parseIntArray(searchParams.get("types")) as PayloadTypeValue[],
      routeTypes: parseIntArray(searchParams.get("routes")) as RouteTypeValue[],
      observers: parseStringArray(searchParams.get("obs")),
      scopes: parseStringArray(searchParams.get("scope")),
      search: searchParams.get("q") ?? "",
      searchField: parseSearchField(searchParams.get("sf")),
    }),
    [searchParams],
  );

  const setFilter = useCallback(
    (key: "payloadTypes" | "routeTypes" | "observers" | "scopes", values: (number | string)[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const paramKey =
            key === "payloadTypes" ? "types" : key === "routeTypes" ? "routes" : key === "observers" ? "obs" : "scope";
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
        next.delete("scope");
        next.delete("q");
        next.delete("sf");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { filters, setFilter, setSearch, setSearchField, clearFilters };
}

// The /packets endpoint filters by a single payloadType/routeType/scope per request, so a
// dimension only goes server-side when exactly one value is selected; the rest stay client-side.
export function toServerFilter(filters: PacketFilterState): PacketServerFilter | null {
  const serverFilter: PacketServerFilter = {};
  if (filters.payloadTypes.length === 1) serverFilter.payloadType = filters.payloadTypes[0]!;
  if (filters.routeTypes.length === 1) serverFilter.routeType = filters.routeTypes[0]!;
  if (filters.scopes.length === 1) serverFilter.scope = filters.scopes[0]!;
  return Object.keys(serverFilter).length > 0 ? serverFilter : null;
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
      : packet.latestObserver ? filters.observers.includes(packet.latestObserver.id) : false;
    if (!match) return false;
  }
  if (filters.scopes.length > 0 && (!packet.scope || !filters.scopes.includes(packet.scope))) {
    return false;
  }
  if (filters.search && filters.searchField === "hash") {
    const q = filters.search.toLowerCase();
    if (!packet.packetHash.toLowerCase().includes(q)) {
      return false;
    }
  }
  return true;
}
