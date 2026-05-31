import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, RasterDEMSourceSpecification } from "maplibre-gl";
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

// Keeps the imperative MapLibre lifecycle out of MapView. mapRef + isReady are exposed for future
// overlays that would attach to mapRef.current and re-attach on each style.load, like addTerrain.

const TERRAIN_SOURCE_ID = "terrain-dem";
const HILLSHADE_SOURCE_ID = "hillshade-dem";
const HILLSHADE_LAYER_ID = "hillshade";

// Terrain and the hillshade layer pull the same terrarium tiles, but maplibre warns when they share
// a single source (it costs render quality), so we describe the source once and add it twice.
const demSource = (): RasterDEMSourceSpecification => ({
  type: "raster-dem",
  tiles: DEM_TILES,
  encoding: "terrarium",
  tileSize: 256, // terrarium tiles are 256px, not the raster-dem default of 512
  maxzoom: 15,
  attribution: DEM_ATTRIBUTION, // same string on both sources; the attribution control de-dupes it
});

// Idempotent (guarded by getSource/getLayer) so it is safe to run on both 'load' and every
// 'style.load' — setStyle() drops imperatively-added sources/layers, so terrain must be re-added.
function addTerrain(map: MapLibreMap, isDark: boolean) {
  if (!map.getSource(TERRAIN_SOURCE_ID)) map.addSource(TERRAIN_SOURCE_ID, demSource());
  if (!map.getSource(HILLSHADE_SOURCE_ID)) map.addSource(HILLSHADE_SOURCE_ID, demSource());
  if (!map.getLayer(HILLSHADE_LAYER_ID)) {
    // insert beneath labels/roads so they stay legible over the relief
    const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: HILLSHADE_LAYER_ID,
        type: "hillshade",
        source: HILLSHADE_SOURCE_ID,
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

export function useMapLibre(
  styleId: string,
  focus: [number, number] | null,
  onStyleError?: (lastGoodStyleId: string) => void,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleIdRef = useRef(styleId);
  const lastStyleIdRef = useRef(styleId);
  const lastGoodStyleIdRef = useRef(styleId); // last style that loaded; the revert target on a failed swap
  const hasLoadedRef = useRef(false); // a style has loaded at least once (distinguishes initial-load failure)
  const swapPendingRef = useRef(false); // a setStyle() basemap swap is in flight (awaiting style.load)
  const onStyleErrorRef = useRef(onStyleError);
  const focusRef = useRef(focus); // initial focus, read once at map creation
  const lastFocusKeyRef = useRef(focusKey(focus));
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // keep styleId / callback readable inside the async map handlers without writing a ref during render
  useEffect(() => {
    styleIdRef.current = styleId;
  }, [styleId]);
  useEffect(() => {
    onStyleErrorRef.current = onStyleError;
  }, [onStyleError]);

  // Init once. StrictMode-safe: the guard prevents a duplicate map, and cleanup fully tears the
  // map down (map.remove() disposes the GL context + all map.on listeners) and nulls the ref so a
  // remount (StrictMode in dev, or returning to the Map tab) rebuilds cleanly.
  useEffect(() => {
    if (mapRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    // open centered on the selected region when it has coords (deep-link / pre-selected region lands
    // focused); otherwise the configured default view.
    const initialFocus = focusRef.current;
    const map = new maplibregl.Map({
      container,
      style: resolveMapStyle(styleIdRef.current).url,
      center: initialFocus ?? DEFAULT_CENTER,
      zoom: initialFocus ? IATA_ZOOM : DEFAULT_ZOOM,
      pitch: initialFocus ? IATA_PITCH : DEFAULT_PITCH,
      bearing: DEFAULT_BEARING,
      maxPitch: MAX_PITCH,
      attributionControl: false, // replaced below with a compact (always-collapsed) control
    });
    mapRef.current = map;
    lastStyleIdRef.current = styleIdRef.current;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true })); // bottom-right
    // maplibre pops the compact attribution open the first time the basemap credit loads (it tacks
    // on .maplibregl-compact-show). Mark it .maplibregl-compact up front so it skips that and stays
    // a bare (i) on load — clicking it still opens the credit.
    const attrib = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
    attrib?.classList.add("maplibregl-compact");
    attrib?.classList.remove("maplibregl-compact-show");

    const onStyleReady = () => {
      addTerrain(map, resolveMapStyle(styleIdRef.current).dark);
      hasLoadedRef.current = true;
      swapPendingRef.current = false;
      lastGoodStyleIdRef.current = styleIdRef.current;
      setIsReady(true);
      setError(null); // a successful (re)load clears any earlier transient/initial error
    };
    map.on("load", onStyleReady); // first paint (style.load does not reliably fire on initial load)
    map.on("style.load", onStyleReady); // re-add terrain after every setStyle

    // The OpenFreeMap base styles ask for a handful of sprite icons their sprite doesn't ship (e.g.
    // "circle-11"), so maplibre warns on every load. Hand it a transparent 1x1 for anything that
    // isn't ours and the noise goes away — a missing icon already draws nothing, so the map looks
    // identical. Our own markers all start with "node-" and are rasterized by useMapNodes, so we
    // leave those alone. This lives here (not in useMapNodes) so it's listening before the base
    // style's first paint, when those icons are first requested.
    map.on("styleimagemissing", (e) => {
      if (!e.id.startsWith("node-") && !map.hasImage(e.id)) map.addImage(e.id, new ImageData(1, 1));
    });

    map.on("error", (e) => {
      const err = e as { error?: Error; sourceId?: string; tile?: unknown };
      // A single tile/source failure (one basemap or DEM tile timing out / 403 / a momentary network
      // blip) is transient and non-fatal — the rest of the map stays usable — so never blank the map
      // for it. maplibre tags tile/source errors with a tile/sourceId; style-level errors have neither.
      if (err.sourceId != null || err.tile != null) return;
      // The new basemap failed mid-swap. setStyle keeps the old style (and our node layers)
      // rendered, so roll back to the last good style and tell MapView to revert the picker rather
      // than blanking the map under a fatal overlay.
      if (swapPendingRef.current) {
        swapPendingRef.current = false;
        lastStyleIdRef.current = lastGoodStyleIdRef.current;
        setIsReady(true);
        onStyleErrorRef.current?.(lastGoodStyleIdRef.current);
        return;
      }
      // Initial map/style load failed (no basemap ever shown): surface the overlay. It self-heals if a
      // later load succeeds (onStyleReady clears it). Other post-load style errors are left non-fatal.
      if (!hasLoadedRef.current) setError(err.error ?? new Error("Map failed to load"));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setIsReady(false);
    };
    // styleId is read via styleIdRef so the map is built once; style swaps go through the effect below.
  }, []);

  // Swap the basemap only when the style really changes. Skip the initial render (the map's already
  // built with the right style) and redundant swaps, which would cause a wasteful re-fetch and an
  // extra style.load while the first style is still loading. style.load then re-adds terrain.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleId === lastStyleIdRef.current) return;
    lastStyleIdRef.current = styleId;
    swapPendingRef.current = true; // cleared by style.load on success, or by the error handler on failure
    setIsReady(false);
    map.setStyle(resolveMapStyle(styleId).url);
  }, [styleId]);

  // Fly to the selected region's coords (close, tilted), or back to the default overview for "All"
  // or a region with no coords. The key check skips the redundant initial render.
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
