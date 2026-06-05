/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRegions, getRegion } from "../api/client";
import {
  resolveIatas,
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
}

// Loads the region list and each region's detail (member IATAs). Regions are near-static, so this is
// cached long and shared via React Query across every caller. The N detail fetches are fine — there
// are only a handful of regions.
export function useRegions(): RegionsData {
  const { data } = useQuery({
    queryKey: ["regions"],
    queryFn: async () => {
      const summaries = await getRegions();
      return Promise.all(summaries.map((s) => getRegion(s.id)));
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
    return { regions, bySlug, regionIatas };
  }, [data]);
}

export interface RegionFilter {
  iatas: string[] | undefined; // resolved member IATAs to query; undefined = all regions
  regionKey: string; // stable query-key fragment ("*" = all)
}

// The resolved geographic filter consumers pass to queries: the flattened IATA list plus a stable key.
export function useRegion(): RegionFilter {
  const { selection } = useRegionSelection();
  const { regionIatas } = useRegions();

  return useMemo(() => {
    const iatas = resolveIatas(selection, regionIatas);
    return { iatas, regionKey: toRegionKey(iatas) };
  }, [selection, regionIatas]);
}
