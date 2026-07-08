import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, GeoJSONSource, LineLayerSpecification, ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import type { NeighborEdgeProps } from "./node-geojson";
import { NEIGHBORS_SOURCE_ID, NEIGHBORS_LINE_LAYER_ID, NODES_CLUSTER_LAYER_ID } from "./types";

type EdgeFC = FeatureCollection<LineString, NeighborEdgeProps>;

function paletteVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// Opacity: the selected node's coloured edges (they carry `obs`) fade with age — solid when fresh,
// faint by ~4 weeks (matches the 30-day retention). Ambient "on" edges keep the flat selected/dim split.
const NEIGHBOR_OPACITY = [
  "case", ["has", "obs"],
  ["interpolate", ["linear"], ["get", "ageDays"], 0, 0.9, 28, 0.35],
  ["case", ["get", "selected"], 0.9, 0.3],
] as ExpressionSpecification;

// Colour by observation count on a log axis (counts are heavily right-skewed): ~1 red, ~20 yellow,
// ~150+ green, clamped past the ends. Edges without a count (the ambient mesh) fall back to primary.
function neighborLineColor(danger: string, warn: string, green: string, primary: string): ExpressionSpecification {
  return [
    "case", ["has", "obs"],
    ["interpolate", ["linear"], ["log10", ["max", 1, ["get", "obs"]]], 0, danger, 1.3, warn, 2.18, green],
    primary,
  ] as ExpressionSpecification;
}

// Draws neighbor edges as a line layer beneath the node markers. Like useMapNodes, the source and
// layer re-add themselves after a style switch, and edge data flows through a separate setData
// effect so toggling or changing the selection never rebuilds the layer.
export function useMapNeighbors(
  mapRef: React.RefObject<MapLibreMap | null>,
  isReady: boolean,
  edges: EdgeFC,
  themeKey: string,
) {
  const edgesRef = useRef(edges);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // build source + layer, and keep the line color in step with the palette
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const lineColor = neighborLineColor(
      paletteVar("--palette-danger", "#EF4444"),
      paletteVar("--palette-warn", "#EAB308"),
      paletteVar("--palette-green", "#22C55E"),
      paletteVar("--palette-primary", "#3B82F6"),
    );

    if (!map.getSource(NEIGHBORS_SOURCE_ID)) {
      map.addSource(NEIGHBORS_SOURCE_ID, { type: "geojson", data: edgesRef.current });
    }
    if (!map.getLayer(NEIGHBORS_LINE_LAYER_ID)) {
      map.addLayer(
        {
          id: NEIGHBORS_LINE_LAYER_ID,
          type: "line",
          source: NEIGHBORS_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": lineColor,
            // edges touching the selected node read stronger than the ambient mesh
            "line-width": ["case", ["get", "selected"], 2, 1],
            "line-opacity": NEIGHBOR_OPACITY,
          },
        } as LineLayerSpecification,
        // beneath the node markers; guard the beforeId in case the nodes layer isn't added yet
        map.getLayer(NODES_CLUSTER_LAYER_ID) ? NODES_CLUSTER_LAYER_ID : undefined,
      );
    }
    map.setPaintProperty(NEIGHBORS_LINE_LAYER_ID, "line-color", lineColor);
    (map.getSource(NEIGHBORS_SOURCE_ID) as GeoJSONSource).setData(edgesRef.current);
  }, [mapRef, isReady, themeKey]);

  // push new edge data as the selection / toggle / node set changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const src = map.getSource(NEIGHBORS_SOURCE_ID) as GeoJSONSource | undefined;
    if (src) src.setData(edges);
  }, [mapRef, isReady, edges]);

  // remove the layer + source on unmount. Capturing map here is safe: it's the same instance for the
  // component's life, and this cleanup runs before useMapLibre tears the map down.
  useEffect(() => {
    const map = mapRef.current;
    return () => {
      if (!map) return;
      try {
        if (map.getLayer(NEIGHBORS_LINE_LAYER_ID)) map.removeLayer(NEIGHBORS_LINE_LAYER_ID);
        if (map.getSource(NEIGHBORS_SOURCE_ID)) map.removeSource(NEIGHBORS_SOURCE_ID);
      } catch {
        // map may already be torn down
      }
    };
  }, [mapRef]);
}
