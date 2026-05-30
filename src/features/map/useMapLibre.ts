import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  DEM_TILES,
  DEM_ATTRIBUTION,
  TERRAIN_EXAGGERATION,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  DEFAULT_BEARING,
  MAX_PITCH,
  IATA_ZOOM,
  IATA_PITCH,
  resolveMapStyle,
} from "./types";

const focusKey = (focus: [number, number] | null) => (focus ? `${focus[0]},${focus[1]}` : null);

// Imperative MapLibre lifecycle, isolated in a feature-local hook (mirrors usePackets/useClickOutside)
// so MapView stays declarative. Exposes mapRef + isReady as forward-compat handles for future
// WebSocket-driven overlays (they attach to mapRef.current and gate on isReady / re-attach on each
// style.load, the same path addTerrain uses).

const TERRAIN_SOURCE_ID = "terrain-dem";
const HILLSHADE_LAYER_ID = "hillshade";

// Idempotent (guarded by getSource/getLayer) so it is safe to run on both 'load' and every
// 'style.load' — setStyle() drops imperatively-added sources/layers, so terrain must be re-added.
function addTerrain(map: MapLibreMap, isDark: boolean) {
  if (!map.getSource(TERRAIN_SOURCE_ID)) {
    map.addSource(TERRAIN_SOURCE_ID, {
      type: "raster-dem",
      tiles: DEM_TILES,
      encoding: "terrarium",
      tileSize: 256, // terrarium tiles are 256px — overrides the raster-dem spec default of 512
      maxzoom: 15,
      attribution: DEM_ATTRIBUTION,
    });
  }
  if (!map.getLayer(HILLSHADE_LAYER_ID)) {
    // insert beneath labels/roads so they stay legible over the relief
    const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: HILLSHADE_LAYER_ID,
        type: "hillshade",
        source: TERRAIN_SOURCE_ID,
        paint: {
          "hillshade-exaggeration": 0.5,
          "hillshade-shadow-color": isDark ? "#000000" : "#1a1a1a",
          "hillshade-highlight-color": isDark ? "#333333" : "#ffffff",
          "hillshade-illumination-direction": 315,
        },
      },
      firstSymbolId,
    );
  }
  map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: TERRAIN_EXAGGERATION });
}

export function useMapLibre(styleId: string, focus: [number, number] | null) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleIdRef = useRef(styleId);
  const lastStyleIdRef = useRef(styleId);
  const focusRef = useRef(focus); // initial focus, read once at map creation
  const lastFocusKeyRef = useRef(focusKey(focus));
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // keep the latest styleId readable inside async map event handlers (e.g. style.load),
  // without writing to a ref during render
  useEffect(() => {
    styleIdRef.current = styleId;
  }, [styleId]);

  // Init once. StrictMode-safe: the guard prevents a duplicate map, and cleanup fully tears the
  // map down (map.remove() disposes the GL context + all map.on listeners) and nulls the ref so a
  // remount (StrictMode in dev, or returning to the Map tab) rebuilds cleanly.
  useEffect(() => {
    if (mapRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    // open centered on the selected region (if it has coords) so a deep-link / pre-selected IATA
    // lands focused; otherwise the configured default (Canada) view.
    const initialFocus = focusRef.current;
    const map = new maplibregl.Map({
      container,
      style: resolveMapStyle(styleIdRef.current).url,
      center: initialFocus ?? DEFAULT_CENTER,
      zoom: initialFocus ? IATA_ZOOM : DEFAULT_ZOOM,
      pitch: initialFocus ? IATA_PITCH : DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      maxPitch: MAX_PITCH,
    });
    mapRef.current = map;
    lastStyleIdRef.current = styleIdRef.current;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    const onStyleReady = () => {
      addTerrain(map, resolveMapStyle(styleIdRef.current).dark);
      setIsReady(true);
    };
    map.on("load", onStyleReady); // first paint (style.load does not reliably fire on initial load)
    map.on("style.load", onStyleReady); // re-add terrain after every setStyle
    map.on("error", (e) => setError(e.error ?? new Error("Map failed to load")));

    return () => {
      map.remove();
      mapRef.current = null;
      setIsReady(false);
    };
    // styleId is read via styleIdRef so the map is created once; style swaps go through the
    // separate effect below.
  }, []);

  // Swap the basemap on an actual style change. Skips the initial render (the map is already built
  // with the right style) and no-ops redundant changes, avoiding a wasteful re-fetch + extra
  // style.load while the first style is still loading. style.load then re-adds terrain.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleId === lastStyleIdRef.current) return;
    lastStyleIdRef.current = styleId;
    setIsReady(false);
    map.setStyle(resolveMapStyle(styleId).url);
  }, [styleId]);

  // Move the camera when the selected region changes. A region with coordinates flies to it
  // (close, tilted); ALL ("*") or a region without coordinates flies back to the default Canada
  // overview (zoomed out, flat). The key comparison skips the redundant initial render.
  useEffect(() => {
    const map = mapRef.current;
    const key = focusKey(focus);
    if (!map || key === lastFocusKeyRef.current) return;
    lastFocusKeyRef.current = key;
    map.flyTo(
      focus
        ? { center: focus, zoom: IATA_ZOOM, pitch: IATA_PITCH, bearing: DEFAULT_BEARING }
        : { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING },
    );
  }, [focus]);

  return { containerRef, mapRef, isReady, error };
}
