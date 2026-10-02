/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRegions, getRegion } from "../api/client";
import {
  resolveIatas,
  emptyRegionSlug,
  regionKey as toRegionKey,
  serializeSelection,
  type RegionSelection,
} from "./region-selection";
import type { Region } from "../types/api";

// Region context: the shared geographic filter. The provider holds the raw selection (region slugs +
// individual IATAs); useRegions() loads the slug→IATAs expansion, and useRegion() combines them into
// the resolved IATA list + stable query key that the rest of the app filters on.

const STORAGE_KEY = "beacon-region-selection";

interface RegionContextValue {
  selection: RegionSelection;
  setSelection: (selection: RegionSelection) => void;
}

const RegionContext = createContext<RegionContextValue | null>(null);

export function RegionProvider({ defaultSelection, children }: { defaultSelection: RegionSelection; children: ReactNode }) {
  const [selection, setSelectionState] = useState(defaultSelection);

  const setSelection = useCallback((next: RegionSelection) => {
    setSelectionState(next);
    try {
      localStorage.setItem(STORAGE_KEY, serializeSelection(next));
    } catch {
      // private-mode / quota — selection still lives in state, just not persisted
    }
  }, []);

  const value = useMemo(() => ({ selection, setSelection }), [selection, setSelection]);
  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

// Raw selection + setter, for the region selector UI.
export function useRegionSelection(): RegionContextValue {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegionSelection must be used within RegionProvider");
  return ctx;
}

export interface RegionsData {
  regions: Region[]; // full detail (member IATAs + map-focus hints), ordered by the API
  bySlug: ReadonlyMap<string, Region>;
  regionIatas: ReadonlyMap<string, string[]>; // slug → member IATA codes, for selection resolution
  settled: boolean; // the region list has loaded
}

// Loads the region list and each region's detail (member IATAs). Regions are near-static, so this is
// cached long and shared via React Query across every caller. The N detail fetches are fine — there
// are only a handful of regions.
export function useRegions(): RegionsData {
  const { data } = useQuery({
    queryKey: ["regions"],
    queryFn: async () => {
      const summaries = await getRegions();
      // a listed region whose detail 404s is dropped like an unknown slug; 4xx is never retried,
      // so failing the whole query would leave the selection unresolved for good
      const regions = await Promise.all(summaries.map((s) => getRegion(s.id).catch((err: unknown) => {
        if ((err as { status?: unknown } | null)?.status !== 404) throw err;
        return null;
      })));
      return regions.filter((r): r is Region => r !== null);
    },
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const regions = data ?? [];
    const bySlug = new Map<string, Region>();
    const regionIatas = new Map<string, string[]>();
    for (const r of regions) {
      bySlug.set(r.slug, r);
      regionIatas.set(r.slug, r.iatas);
    }
    return { regions, bySlug, regionIatas, settled: data !== undefined };
  }, [data]);
}

export interface RegionFilter {
  iatas: string[] | undefined; // resolved member IATAs to query; undefined = all regions, [] = a region with none
  regionKey: string; // stable query-key fragment ("*" = all)
  isResolved?: boolean; // false while a selected region's member IATAs are unavailable
  emptyRegion?: string; // slug of a selected region that has no member IATAs
}

// The resolved geographic filter consumers pass to queries: the flattened IATA list plus a stable key.
export function useRegion(): RegionFilter {
  const { selection } = useRegionSelection();
  const { regionIatas, settled } = useRegions();

  return useMemo(() => {
    const iatas = resolveIatas(selection, regionIatas);
    const emptyRegion = emptyRegionSlug(selection, regionIatas);
    // a slug missing from a loaded list (deleted region, stale link) must not hold everything up
    const isResolved = settled || selection.regions.every((slug) => regionIatas.has(slug));
    const key = emptyRegion ? `region:${emptyRegion}` : toRegionKey(iatas);
    return {
      iatas: emptyRegion ? [] : iatas,
      // a pending key keeps half-resolved results out of the resolved region's cache
      regionKey: isResolved ? key : `${key}:pending`,
      isResolved,
      emptyRegion,
    };
  }, [selection, regionIatas, settled]);
}
