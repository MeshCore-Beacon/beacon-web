// Map feature config. Pure data + a total style lookup; no side effects, no maplibre import
// (DEFAULT_CENTER is a plain [lng, lat] tuple, a valid maplibre LngLatLike, so this module
// stays dependency-free and unit-testable without pulling in the WebGL engine).

export interface MapStyleOption {
  id: string;
  name: string;
  url: string;
  dark: boolean;
}

export const MAP_STYLES: MapStyleOption[] = [
  { id: "dark", name: "Dark", url: "https://tiles.openfreemap.org/styles/dark", dark: true },
  { id: "liberty", name: "Liberty", url: "https://tiles.openfreemap.org/styles/liberty", dark: false },
  { id: "positron", name: "Light", url: "https://tiles.openfreemap.org/styles/positron", dark: false },
];

export const DEFAULT_STYLE_ID = "dark";

// beacon-* matches the codebase convention (beacon-theme, beacon-region, beacon-analyzer-open)
export const MAP_STYLE_STORAGE_KEY = "beacon-map-style";

// Total lookup: MAP_STYLES.find() is MapStyleOption | undefined, and reading .url/.dark off it
// would fail to compile under strict mode. Falling back to the first (non-empty const) entry also
// guards against a stale/invalid id restored from localStorage.
export function resolveMapStyle(id: string): MapStyleOption {
  return MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0]!;
}

// DEM terrain tiles: public AWS Open Data terrarium set (keyless). The tiles are 256px, which
// overrides the raster-dem spec default of 512 — do NOT "fix" this to 512.
export const DEM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

// MapLibre auto-attributes the OpenFreeMap basemap from its style JSON, but NOT a hand-added
// raster-dem source. The terrarium data requires display attribution, supplied via the source's
// `attribution` field so it surfaces in the default AttributionControl.
export const DEM_ATTRIBUTION =
  '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Tilezen Joerd</a>';

export const TERRAIN_EXAGGERATION = 1.5;

// Default view fits Canada, weighted south so the populated provinces sit near the middle. The
// center is configurable via VITE_MAP_CENTER, written as decimal "lat,lon" (e.g. "57.5,-96.8");
// it falls back to this Canada-fitting center when unset or invalid.
const CANADA_CENTER: [number, number] = [-96.8, 57.5]; // [lng, lat]

export function parseMapCenter(raw: string | undefined): [number, number] {
  if (!raw) return CANADA_CENTER;
  const parts = raw.split(",").map((p) => Number.parseFloat(p.trim()));
  const [lat, lon] = parts;
  if (
    parts.length !== 2 ||
    lat === undefined ||
    lon === undefined ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return CANADA_CENTER;
  }
  return [lon, lat]; // env is "lat,lon" (decimal); maplibre wants [lng, lat]
}

export const DEFAULT_CENTER: [number, number] = parseMapCenter(
  import.meta.env.VITE_MAP_CENTER as string | undefined,
);
export const DEFAULT_ZOOM = 3.2; // fits Canada on load
export const DEFAULT_PITCH = 0; // flat country overview
export const DEFAULT_BEARING = 0;
export const MAX_PITCH = 85;

// Camera used when focusing a selected IATA region that has coordinates.
export const IATA_ZOOM = 9;
export const IATA_PITCH = 45; // engage the 3D terrain tilt at the focused location
