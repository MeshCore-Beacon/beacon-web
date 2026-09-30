import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { getIataBorder, type IataBorder } from "../../api/client";

// Identity ids for border data objects, so the sig below reflects a real data change rather than a
// refetch timestamp (TanStack's structural sharing keeps unchanged geometry referentially equal).
const idsByData = new WeakMap<object, number>();
let nextId = 1;
function idOf(data: unknown): number {
  if (data == null || typeof data !== "object") return 0;
  let id = idsByData.get(data);
  if (id == null) { id = nextId++; idsByData.set(data, id); }
  return id;
}

export type BorderProps = { iata: string; [key: string]: unknown };
export type BorderFeatureCollection = FeatureCollection<Polygon | MultiPolygon, BorderProps>;

// Merge each IATA's border into one collection, dropping the ones with no border and stamping the
// IATA code onto every feature so the layer can style/label per region.
export function mergeBorders(entries: { iata: string; border: IataBorder | null }[]): BorderFeatureCollection {
  const features = entries.flatMap((e) =>
    e.border
      ? [{ ...e.border, properties: { ...(e.border.properties ?? {}), iata: e.iata } } as Feature<Polygon | MultiPolygon, BorderProps>]
      : [],
  );
  return { type: "FeatureCollection", features };
}

// Fetch the border for each active IATA (only while `enabled`), then merge into one collection.
// Cache geometry for an hour; missing borders can appear after an operator imports a snapshot.
export function useMapBordersData(iataCodes: string[], enabled: boolean): BorderFeatureCollection {
  const results = useQueries({
    queries: iataCodes.map((iata) => ({
      queryKey: ["iata-border", iata],
      queryFn: () => getIataBorder(iata),
      enabled,
      staleTime: (query: { state: { data: unknown } }) => query.state.data ? 3_600_000 : 60_000,
    })),
  });

  // Keep the collection stable between renders, but replace geometry after a successful refresh.
  const sig = iataCodes.map((iata, i) => `${iata}:${idOf(results[i]?.data)}`).join("|");
  return useMemo(
    () => mergeBorders(iataCodes.map((iata, i) => ({ iata, border: results[i]?.data ?? null }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sig captures iataCodes + which borders loaded
    [sig],
  );
}
