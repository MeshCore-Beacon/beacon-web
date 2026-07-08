// Map feature config: pure data and lookups, no maplibre import, so it stays unit-testable
// without pulling in the WebGL engine.

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
export const MAP_CLUSTER_STORAGE_KEY = "beacon-map-clustering";
export const MAP_NODE_TYPE_STORAGE_KEY = "beacon-map-node-type";

// Always returns an option: falls back to the first entry, which also covers a stale/invalid id
// restored from localStorage.
export function resolveMapStyle(id: string): MapStyleOption {
  return MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0]!;
}

// DEM terrain tiles: public AWS Open Data terrarium set (keyless), 256px tiles (not the raster-dem
// spec default of 512).
export const DEM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

// maplibre auto-attributes the basemap from its style JSON, but not a hand-added raster-dem source.
// The terrarium data requires attribution, so it's set on the source and surfaces in the control.
export const DEM_ATTRIBUTION =
  '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener">Tilezen Joerd</a>';

export const TERRAIN_EXAGGERATION = 1.5;

// The fallback/initial map view, configured per deployment via .env (VITE_MAP_CENTER as decimal
// "lat,lon", VITE_MAP_ZOOM). Used before airports load and when a selection has no airport coords;
// otherwise MapView fits bounds over the airports (see CLAUDE.md, map framing). With neither set,
// fall back to a wide world overview.
const FALLBACK_CENTER: [number, number] = [0, 20]; // [lng, lat] — neutral world view
const FALLBACK_ZOOM = 1.5;

export function parseMapCenter(raw: string | undefined): [number, number] {
  if (!raw) return FALLBACK_CENTER;
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
    return FALLBACK_CENTER;
  }
  return [lon, lat]; // env is "lat,lon" (decimal); maplibre wants [lng, lat]
}

// Zoom for the fallback/initial view, clamped to the slippy-map range; falls back otherwise.
export function parseMapZoom(raw: string | undefined): number {
  if (!raw) return FALLBACK_ZOOM;
  const zoom = Number.parseFloat(raw.trim());
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 22) return FALLBACK_ZOOM;
  return zoom;
}

export const DEFAULT_CENTER: [number, number] = parseMapCenter(
  import.meta.env.VITE_MAP_CENTER as string | undefined,
);
export const DEFAULT_ZOOM = parseMapZoom(import.meta.env.VITE_MAP_ZOOM as string | undefined);
export const DEFAULT_PITCH = 0; // flat overview, no tilt
export const DEFAULT_BEARING = 0;
export const MAX_PITCH = 85;

// fitBounds caps zoom at IATA_ZOOM; a single-airport fit also gets IATA_PITCH (3D terrain tilt).
export const IATA_ZOOM = 9;
export const IATA_PITCH = 45;

// --- Nodes data layer ---
export const NODES_SOURCE_ID = "nodes";
export const NODES_CLUSTER_LAYER_ID = "nodes-clusters"; // symbol layer (bubble icon + count)
export const NODES_POINT_LAYER_ID = "nodes-unclustered";
export const NODES_SELECTED_LAYER_ID = "nodes-selected"; // circle ring under the selected node's icon
// Same ring for a node shown as a spiderfied leaf (it's inside a cluster, so the id-filtered
// NODES_SELECTED_LAYER_ID can't reach it). Fed by its own geojson source, pointed at the leaf.
export const NODES_SELECTED_LEAF_LAYER_ID = "nodes-selected-leaf";

// --- Neighbor edges layer ---
export const NEIGHBORS_SOURCE_ID = "neighbors";
export const NEIGHBORS_LINE_LAYER_ID = "neighbor-lines"; // line layer drawn beneath the node markers
export const MAP_NEIGHBOR_LINES_STORAGE_KEY = "beacon-map-neighbor-lines";
export type NeighborLinesMode = "on" | "selected" | "off";

// --- Live packet-flow (modelled on MeshMapper's "LiveViz"): dim every node, then per packet shoot an
// orange dot along its real hop path with a fading dashed trail, flashing each node as the dot crosses ---
export const PACKET_FLOW_TRAIL_SOURCE_ID = "packet-flow-trail";
export const PACKET_FLOW_TRAIL_LAYER_ID = "packet-flow-trail"; // dashed line tracing behind the dot
export const PACKET_FLOW_DOT_SOURCE_ID = "packet-flow-dot";
export const PACKET_FLOW_DOT_HALO_LAYER_ID = "packet-flow-dot-halo"; // dark halo behind the dot
export const PACKET_FLOW_DOT_LAYER_ID = "packet-flow-dot"; // the moving packet dot
export const PACKET_FLOW_COLOR = "#ff6b35"; // warm orange, distinct from the node palette so packets pop
export const PACKET_FLOW_HOP_MS = 480; // ms the dot takes to cross one hop segment
export const PACKET_FLOW_FLASH_MS = 900; // a crossed node's flash decays back to dim over this
export const PACKET_FLOW_TRAIL_FADE_MS = 1000; // the dashed trail fades once the dot reaches the end
export const PACKET_FLOW_MAX = 120; // cap on concurrent packet animations (busy-feed guard)
export const LIVE_DIM_OPACITY = 0.18; // idle individual-node opacity while Live mode is on
// Clusters dim further: many overlapping semi-transparent hexagons composite toward opaque, so a
// dense cluster field stops being see-through. A lower per-cluster alpha keeps the stack translucent.
export const LIVE_CLUSTER_DIM_OPACITY = 0.07;

export const CLUSTER_RADIUS = 50; // px
// Keep clustering alive across the whole reachable zoom range (default max is 22). maplibre drops
// clustering above clusterMaxZoom, which would leave co-located nodes as stacked, un-spiderfy-able
// points at high zoom. clusterRadius (50px) shrinks to a tiny ground distance when zoomed in, so
// only genuinely overlapping points stay clustered — which is what spiderfy is for.
export const CLUSTER_MAX_ZOOM = 22;
// Tile maxzoom for the nodes source. Must stay GREATER than CLUSTER_MAX_ZOOM so the deepest tile is
// a real clustered tile, not an overzoom of an unclustered one (else maplibre warns).
export const NODES_SOURCE_MAXZOOM = 24;
// At/above this zoom a cluster click fans out (spiderfy) instead of zooming — the remaining
// clusters are co-located points that zooming can't separate.
export const SPIDERFY_MIN_ZOOM = 14;
// Node name labels fade in at/above this zoom (hidden when zoomed out / clustered).
export const NODE_LABEL_MIN_ZOOM = 12;

// Device types live in lib/node-types; re-exported here for the map feature's consumers.
export { NODE_TYPE_NAMES, NODE_TYPE_OPTIONS as NODE_TYPE_FILTER_OPTIONS } from "../../lib/node-types";
export type { NodeTypeName } from "../../lib/node-types";
export const NODE_ICON_UNKNOWN = "node-unknown";
export const nodeIconId = (typeName: string): string => `node-${typeName}`;

// --- Cluster marker (cyberpunk hexagon) ---
// Cluster icon: a hexagon with a 12-segment gauge ring — bigger clusters light more segments. The
// count sits in the middle (symbol text-field); the density level is picked by the step expression below.
export const CLUSTER_ICON_ID = "node-cluster";

export interface ClusterBucket {
  minCount: number; // first point_count that maps to this level (buckets are ascending)
  id: string; // maplibre image id
  lit: number; // gauge segments lit (of 12)
}

// Six density levels (5/15/25/50/100). The first bucket (minCount 0) is the floor — maplibre only
// forms clusters of 2+ — and the last is fully lit for clusters of 100+.
export const CLUSTER_BUCKETS: ClusterBucket[] = [
  { minCount: 0, id: CLUSTER_ICON_ID, lit: 1 },
  { minCount: 5, id: "node-cluster-2", lit: 2 },
  { minCount: 15, id: "node-cluster-3", lit: 4 },
  { minCount: 25, id: "node-cluster-4", lit: 5 },
  { minCount: 50, id: "node-cluster-5", lit: 8 },
  { minCount: 100, id: "node-cluster-6", lit: 12 },
];

export const CLUSTER_ICON_IDS = CLUSTER_BUCKETS.map((b) => b.id);

// step expression selecting the density level by point_count: the first output is the default (the
// floor bucket) and each later bucket adds a (minCount, id) stop. Untyped so this module stays
// maplibre-free; the caller casts.
export function clusterIconImageExpression(): unknown[] {
  const [first, ...rest] = CLUSTER_BUCKETS;
  return ["step", ["get", "point_count"], first!.id, ...rest.flatMap((b) => [b.minCount, b.id])];
}
