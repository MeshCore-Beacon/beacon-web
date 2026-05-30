import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMapLibre } from "./useMapLibre";
import { MapStyleSwitcher } from "./MapStyleSwitcher";
import { MAP_STYLE_STORAGE_KEY, DEFAULT_STYLE_ID, resolveMapStyle } from "./types";
import { EmptyState } from "../../components/EmptyState";
import { useRegion } from "../../hooks/useRegion";
import { getIatas } from "../../api/client";

export function MapView() {
  // restore the saved style for next visit; resolveMapStyle normalizes a stale/invalid stored id
  const [styleId, setStyleId] = useState(
    () => resolveMapStyle(localStorage.getItem(MAP_STYLE_STORAGE_KEY) ?? DEFAULT_STYLE_ID).id,
  );

  const handleChange = useCallback((id: string) => {
    setStyleId(id);
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, id); // persist for next visit
  }, []);

  const region = useRegion();
  const { data: iatas } = useQuery({ queryKey: ["iatas"], queryFn: getIatas, staleTime: 60_000 });

  // focus the map on the selected region when the API provides its coordinates ("*" = all regions)
  const focus = useMemo<[number, number] | null>(() => {
    if (region === "*") return null;
    const match = iatas?.find((i) => i.iata === region);
    return match && match.lat != null && match.lon != null ? [match.lon, match.lat] : null;
  }, [region, iatas]);

  const { containerRef, error } = useMapLibre(styleId, focus);
  const isDark = resolveMapStyle(styleId).dark;

  return (
    <div className="relative flex flex-1 min-h-0">
      {/* Fill via flex-1, NOT absolute inset-0: maplibre adds .maplibregl-map { position: relative }
          to this element, which overrides Tailwind's `absolute` and would collapse inset-0 to 0
          height. data-dark drives the maplibre control theming in index.css. */}
      <div ref={containerRef} data-dark={isDark} className="flex-1" />
      <MapStyleSwitcher
        styleId={styleId}
        onChange={handleChange}
        className="absolute top-3 left-3 z-10"
      />
      {error && (
        <div className="absolute inset-0 bg-bg-base">
          <EmptyState title="Map failed to load" subtitle="Check your connection and reload" />
        </div>
      )}
    </div>
  );
}
