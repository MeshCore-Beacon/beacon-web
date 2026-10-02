import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, GeoJSONSource, FillLayerSpecification, LineLayerSpecification } from "maplibre-gl";
import {
  IATA_BORDERS_SOURCE_ID,
  IATA_BORDERS_FILL_LAYER_ID,
  IATA_BORDERS_LINE_LAYER_ID,
  NODES_CLUSTER_LAYER_ID,
} from "./types";
import type { BorderFeatureCollection } from "./useMapBordersData";

function paletteVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// Draws IATA region borders as a low-alpha fill + outline beneath the node markers. Mirrors
// useMapNeighbors: the source/layers re-add themselves after a style switch, the paint tracks the
// palette on theme change, and border data flows through a separate setData effect so toggling the
// layer on/off never rebuilds it.
export function useMapBorders(
  mapRef: React.RefObject<MapLibreMap | null>,
  isReady: boolean,
  data: BorderFeatureCollection,
  themeKey: string,
) {
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // build source + fill + line, and keep the colour in step with the palette
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const color = paletteVar("--palette-secondary", "#A78BFA");
    const beforeId = map.getLayer(NODES_CLUSTER_LAYER_ID) ? NODES_CLUSTER_LAYER_ID : undefined;

    if (!map.getSource(IATA_BORDERS_SOURCE_ID)) {
      map.addSource(IATA_BORDERS_SOURCE_ID, { type: "geojson", data: dataRef.current });
    }
    // fill first so the outline sits on top of it; both go beneath the node markers
    if (!map.getLayer(IATA_BORDERS_FILL_LAYER_ID)) {
      map.addLayer(
        {
          id: IATA_BORDERS_FILL_LAYER_ID,
          type: "fill",
          source: IATA_BORDERS_SOURCE_ID,
          paint: { "fill-color": color, "fill-opacity": 0.08 },
        } as FillLayerSpecification,
        beforeId,
      );
    }
    if (!map.getLayer(IATA_BORDERS_LINE_LAYER_ID)) {
      map.addLayer(
        {
          id: IATA_BORDERS_LINE_LAYER_ID,
          type: "line",
          source: IATA_BORDERS_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": color, "line-width": 1.5, "line-opacity": 0.8 },
        } as LineLayerSpecification,
        beforeId,
      );
    }
    map.setPaintProperty(IATA_BORDERS_FILL_LAYER_ID, "fill-color", color);
    map.setPaintProperty(IATA_BORDERS_LINE_LAYER_ID, "line-color", color);
    (map.getSource(IATA_BORDERS_SOURCE_ID) as GeoJSONSource).setData(dataRef.current);
  }, [mapRef, isReady, themeKey]);

  // push new border data as the toggle / region changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const src = map.getSource(IATA_BORDERS_SOURCE_ID) as GeoJSONSource | undefined;
    if (src) src.setData(data);
  }, [mapRef, isReady, data]);

  // remove layers (before the source) on unmount; useMapLibre's map.remove() runs first, hence the try
  useEffect(() => {
    const map = mapRef.current;
    return () => {
      if (!map) return;
      try {
        if (map.getLayer(IATA_BORDERS_LINE_LAYER_ID)) map.removeLayer(IATA_BORDERS_LINE_LAYER_ID);
        if (map.getLayer(IATA_BORDERS_FILL_LAYER_ID)) map.removeLayer(IATA_BORDERS_FILL_LAYER_ID);
        if (map.getSource(IATA_BORDERS_SOURCE_ID)) map.removeSource(IATA_BORDERS_SOURCE_ID);
      } catch {
        // map may already be torn down
      }
    };
  }, [mapRef]);
}
