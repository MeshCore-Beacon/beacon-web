import type maplibregl from "maplibre-gl";
import { emptyFeatureCollection } from "./geojson";

export const NODE_SOURCE = "tower-map-nodes";
export const OBSERVER_SOURCE = "tower-map-observers";
export const ROUTE_SOURCE = "tower-map-routes";
export const LIVE_SOURCE = "tower-map-live";

export const NODE_CLUSTER_LAYER = "tower-map-node-clusters";
export const NODE_CLUSTER_COUNT_LAYER = "tower-map-node-cluster-counts";
export const NODE_LAYER = "tower-map-node-points";
export const OBSERVER_LAYER = "tower-map-observer-points";
export const ROUTE_LAYER = "tower-map-route-lines";
export const LIVE_LAYER = "tower-map-live-lines";

export function addTowerMapLayers(map: maplibregl.Map): void {
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: emptyFeatureCollection() as never });
  }
  if (!map.getSource(LIVE_SOURCE)) {
    map.addSource(LIVE_SOURCE, { type: "geojson", data: emptyFeatureCollection() as never });
  }
  if (!map.getSource(NODE_SOURCE)) {
    map.addSource(NODE_SOURCE, {
      type: "geojson",
      data: emptyFeatureCollection() as never,
      cluster: true,
      clusterRadius: 56,
      clusterMaxZoom: 7,
    } as maplibregl.GeoJSONSourceSpecification);
  }
  if (!map.getSource(OBSERVER_SOURCE)) {
    map.addSource(OBSERVER_SOURCE, { type: "geojson", data: emptyFeatureCollection() as never });
  }

  addLayer(map, {
    id: ROUTE_LAYER,
    type: "line",
    source: ROUTE_SOURCE,
    minzoom: 6,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#22c55e",
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.24, 10, 0.56],
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.1, 11, 2.8],
    },
  });

  addLayer(map, {
    id: LIVE_LAYER,
    type: "line",
    source: LIVE_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#f97316",
      "line-opacity": ["coalesce", ["get", "opacity"], 0],
      "line-width": ["interpolate", ["linear"], ["zoom"], 4, 2.4, 10, 5.2],
      "line-blur": 2.8,
    },
  });

  addLayer(map, {
    id: NODE_CLUSTER_LAYER,
    type: "circle",
    source: NODE_SOURCE,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": ["step", ["get", "point_count"], "#2563eb", 12, "#0891b2", 40, "#16a34a"],
      "circle-radius": ["step", ["get", "point_count"], 17, 12, 22, 40, 29],
      "circle-opacity": 0.88,
      "circle-stroke-color": "#f8fafc",
      "circle-stroke-width": 1.2,
    },
  });

  addLayer(map, {
    id: NODE_CLUSTER_COUNT_LAYER,
    type: "symbol",
    source: NODE_SOURCE,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["to-string", ["get", "point_count"]],
      "text-size": 11,
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#0f172a",
      "text-halo-width": 1.2,
    },
  });

  addLayer(map, {
    id: NODE_LAYER,
    type: "circle",
    source: NODE_SOURCE,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match",
        ["get", "role"],
        "repeater",
        "#22c55e",
        "room_server",
        "#a855f7",
        "companion",
        "#3b82f6",
        "sensor",
        "#84cc16",
        "#64748b",
      ],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4.5, 11, 8],
      "circle-opacity": 0.92,
      "circle-stroke-color": "#f8fafc",
      "circle-stroke-width": 1.2,
    },
  });

  addLayer(map, {
    id: OBSERVER_LAYER,
    type: "circle",
    source: OBSERVER_SOURCE,
    paint: {
      "circle-color": ["case", ["==", ["get", "online"], true], "#f59e0b", "#78716c"],
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 5.5, 11, 9.5],
      "circle-opacity": 0.95,
      "circle-stroke-color": "#fff7ed",
      "circle-stroke-width": 1.6,
    },
  });
}

export function setLayerVisible(map: maplibregl.Map, layerId: string, visible: boolean): void {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

function addLayer(map: maplibregl.Map, layer: maplibregl.LayerSpecification): void {
  if (!map.getLayer(layer.id)) {
    map.addLayer(layer);
  }
}
