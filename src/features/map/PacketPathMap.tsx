// src/features/map/PacketPathMap.tsx
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type {
  Map as MapLibreMap,
  GeoJSONSource,
  LineLayerSpecification,
  CircleLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import type { PacketPath } from "./packet-path";
import { packetPathsToFeatures } from "./packet-path";
import { resolveMapStyle, DEFAULT_CENTER, DEFAULT_ZOOM, IATA_ZOOM } from "./types";

// Private ids — this map instance is dedicated to the popup, so they can't collide with the main map.
const LINE_SOURCE = "pp-lines";
const LINE_LAYER = "pp-lines";
const NODE_SOURCE = "pp-nodes";
const NODE_LAYER = "pp-nodes";
const NODE_LABEL_LAYER = "pp-node-labels";

function paletteVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// A self-contained MapLibre map that draws a packet's resolved path(s). Owns its own instance so it
// never touches the Map tab's map; the pure builders shape the data, this wires it to GL.
export function PacketPathMap({ paths, selectedKey, styleId }: {
  paths: PacketPath[];
  selectedKey: string | null;
  styleId: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

  // build the map once (styleId is read at creation; the popup doesn't hot-swap basemaps)
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: resolveMapStyle(styleId).url,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    const onLoad = () => setReady(true);
    map.on("load", onLoad);
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [styleId]);

  // (re)build layers, push data, and frame the shown paths whenever data or selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const { lines, points, bounds } = packetPathsToFeatures(paths, selectedKey);

    if (!map.getSource(LINE_SOURCE)) map.addSource(LINE_SOURCE, { type: "geojson", data: lines });
    if (!map.getLayer(LINE_LAYER)) {
      map.addLayer({
        id: LINE_LAYER, type: "line", source: LINE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.9 },
      } as LineLayerSpecification);
    }
    if (!map.getSource(NODE_SOURCE)) map.addSource(NODE_SOURCE, { type: "geojson", data: points });
    if (!map.getLayer(NODE_LAYER)) {
      map.addLayer({
        id: NODE_LAYER, type: "circle", source: NODE_SOURCE,
        paint: {
          "circle-radius": ["case", ["==", ["get", "endpoint"], "mid"], 4, 6],
          "circle-color": ["get", "color"],
          // white ring marks the observer-end node; every other node gets a dark ring
          "circle-stroke-width": 2,
          "circle-stroke-color": ["case", ["==", ["get", "endpoint"], "end"], "#ffffff", "#00000088"],
        },
      } as CircleLayerSpecification);
    }
    if (!map.getLayer(NODE_LABEL_LAYER)) {
      map.addLayer({
        id: NODE_LABEL_LAYER, type: "symbol", source: NODE_SOURCE,
        layout: { "text-field": ["get", "label"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true },
        paint: {
          "text-color": paletteVar("--palette-text-bright", "#e5e7eb"),
          "text-halo-color": paletteVar("--palette-bg-base", "#0a0a0a"),
          "text-halo-width": 1.4,
        },
      } as SymbolLayerSpecification);
    }

    (map.getSource(LINE_SOURCE) as GeoJSONSource).setData(lines);
    (map.getSource(NODE_SOURCE) as GeoJSONSource).setData(points);

    if (bounds.length) {
      const b = bounds.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(bounds[0], bounds[0]));
      map.fitBounds(b, { padding: 60, maxZoom: IATA_ZOOM });
    }
  }, [ready, paths, selectedKey]);

  return <div ref={containerRef} className="w-full h-full" />;
}
