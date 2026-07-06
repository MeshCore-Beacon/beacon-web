import { useCallback, useEffect, useRef } from "react";
import type { Map as MapLibreMap, GeoJSONSource, CircleLayerSpecification, ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { WsManager } from "../../api/ws-manager";
import { resolvedPathNodes, buildLitFC, routeMetrics, buildCometFC, pulseProgress, type LitNode, type Pulse } from "./packet-flow";
import {
  PACKET_FLOW_SOURCE_ID,
  PACKET_FLOW_LAYER_ID,
  PACKET_FLOW_COMET_SOURCE_ID,
  PACKET_FLOW_COMET_LAYER_ID,
  PACKET_FLOW_FADE_MS,
  PACKET_FLOW_SEGMENT_MS,
  LIVE_DIM_OPACITY,
  NODES_POINT_LAYER_ID,
  NODES_CLUSTER_LAYER_ID,
  NODE_LABEL_MIN_ZOOM,
} from "./types";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

// node labels normally fade in past NODE_LABEL_MIN_ZOOM — restored when Live turns off
const LABEL_OPACITY: ExpressionSpecification = ["step", ["zoom"], 0, NODE_LABEL_MIN_ZOOM, 1];

function paletteVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// Live mode: dim every node/cluster to near-invisible; on each observed packet, flash its resolved-path
// nodes to full opacity (fading over PACKET_FLOW_FADE_MS) and shoot a comet along the route. Enabling
// it opts the WS connection into resolvedPath data. Geometry is pure (packet-flow.ts); here we own the
// maplibre layers, the dimming, the rAF loop, and the subscription.
export function useMapPacketFlow(
  mapRef: React.RefObject<MapLibreMap | null>,
  isReady: boolean,
  enabled: boolean,
  wsManager: WsManager,
  themeKey: string,
  resetKey: string,
) {
  const litRef = useRef<Map<string, LitNode>>(new Map());
  const pulsesRef = useRef<Pulse[]>([]);
  const nextIdRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // one animation frame: fade the lit nodes and advance the comets; keep going while either has work
  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    function frame() {
      const map = mapRef.current;
      const now = performance.now();

      for (const [id, n] of litRef.current) {
        if (now - n.litAt >= PACKET_FLOW_FADE_MS) litRef.current.delete(id);
      }
      const litSrc = map?.getSource(PACKET_FLOW_SOURCE_ID) as GeoJSONSource | undefined;
      if (litSrc) litSrc.setData(buildLitFC([...litRef.current.values()], now, PACKET_FLOW_FADE_MS));

      pulsesRef.current = pulsesRef.current.filter((p) => pulseProgress(p, now) <= 1);
      const cometSrc = map?.getSource(PACKET_FLOW_COMET_SOURCE_ID) as GeoJSONSource | undefined;
      if (cometSrc) cometSrc.setData(buildCometFC(pulsesRef.current, now));

      const busy = litRef.current.size > 0 || pulsesRef.current.length > 0;
      rafRef.current = busy ? requestAnimationFrame(frame) : null;
    }
    rafRef.current = requestAnimationFrame(frame);
  }, [mapRef]);

  // build both layers: the node-highlight glow and the comet (head + trail). Re-adds after a style switch.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const accent = paletteVar("--palette-primary", "#3B82F6");

    if (!map.getSource(PACKET_FLOW_SOURCE_ID)) {
      map.addSource(PACKET_FLOW_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(PACKET_FLOW_LAYER_ID)) {
      // no beforeId: draw over the dimmed markers
      map.addLayer({
        id: PACKET_FLOW_LAYER_ID,
        type: "circle",
        source: PACKET_FLOW_SOURCE_ID,
        paint: {
          "circle-radius": 9,
          "circle-color": accent,
          "circle-opacity": ["*", ["get", "opacity"], 0.85],
          "circle-blur": 0.35,
          "circle-stroke-width": 2,
          "circle-stroke-color": accent,
          "circle-stroke-opacity": ["get", "opacity"],
        },
      } as CircleLayerSpecification);
    }
    map.setPaintProperty(PACKET_FLOW_LAYER_ID, "circle-color", accent);
    map.setPaintProperty(PACKET_FLOW_LAYER_ID, "circle-stroke-color", accent);

    // comet on top of the glow
    if (!map.getSource(PACKET_FLOW_COMET_SOURCE_ID)) {
      map.addSource(PACKET_FLOW_COMET_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(PACKET_FLOW_COMET_LAYER_ID)) {
      map.addLayer({
        id: PACKET_FLOW_COMET_LAYER_ID,
        type: "circle",
        source: PACKET_FLOW_COMET_SOURCE_ID,
        paint: {
          "circle-radius": ["case", ["==", ["get", "head"], 1], 5, 3],
          "circle-color": accent,
          "circle-opacity": ["get", "opacity"],
          "circle-blur": 0.5,
        },
      } as CircleLayerSpecification);
    }
    map.setPaintProperty(PACKET_FLOW_COMET_LAYER_ID, "circle-color", accent);
  }, [mapRef, isReady, themeKey]);

  // connection-wide resolvePath toggle: on while enabled, off otherwise
  useEffect(() => {
    wsManager.setResolvePath(enabled);
    return () => wsManager.setResolvePath(false);
  }, [enabled, wsManager]);

  // dim (or restore) the base node + cluster layers. Keyed on themeKey too so it re-applies after
  // useMapNodes rebuilds its layers on a theme/style change (that hook runs first, resetting opacity).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const iconOpacity = enabled ? LIVE_DIM_OPACITY : 1;
    for (const id of [NODES_POINT_LAYER_ID, NODES_CLUSTER_LAYER_ID]) {
      if (map.getLayer(id)) map.setPaintProperty(id, "icon-opacity", iconOpacity);
    }
    if (map.getLayer(NODES_POINT_LAYER_ID)) {
      map.setPaintProperty(NODES_POINT_LAYER_ID, "text-opacity", enabled ? 0 : LABEL_OPACITY);
    }
    if (map.getLayer(NODES_CLUSTER_LAYER_ID)) {
      map.setPaintProperty(NODES_CLUSTER_LAYER_ID, "text-opacity", enabled ? 0 : 1);
    }
  }, [mapRef, isReady, enabled, themeKey]);

  // per observed packet: flash its route's nodes and launch a comet along the route
  useEffect(() => {
    if (!enabled) return;
    const map = mapRef.current;
    const lit = litRef.current; // stable Map for the component's life; used in the cleanup too
    const unsub = wsManager.onPacketObservation((data) => {
      const resolved = data.observation?.resolvedPath;
      if (!resolved || resolved.length === 0) return;
      const nodes = resolvedPathNodes(resolved);
      if (nodes.length === 0) return;
      const now = performance.now();

      for (const n of nodes) lit.set(n.id, { lng: n.lng, lat: n.lat, litAt: now });

      if (nodes.length >= 2) {
        const coords = nodes.map((n) => [n.lng, n.lat] as [number, number]);
        const { cumLengths, total } = routeMetrics(coords);
        if (total > 0) {
          pulsesRef.current.push({
            id: nextIdRef.current++,
            coords,
            cumLengths,
            total,
            startMs: now,
            durationMs: (coords.length - 1) * PACKET_FLOW_SEGMENT_MS,
          });
        }
      }
      startLoop();
    });

    return () => {
      unsub();
      lit.clear();
      pulsesRef.current = [];
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      (map?.getSource(PACKET_FLOW_SOURCE_ID) as GeoJSONSource | undefined)?.setData(EMPTY_FC);
      (map?.getSource(PACKET_FLOW_COMET_SOURCE_ID) as GeoJSONSource | undefined)?.setData(EMPTY_FC);
    };
  }, [enabled, wsManager, mapRef, startLoop]);

  // clear highlights + comets when the region changes (they came from the old dataset)
  useEffect(() => {
    litRef.current.clear();
    pulsesRef.current = [];
    const map = mapRef.current;
    (map?.getSource(PACKET_FLOW_SOURCE_ID) as GeoJSONSource | undefined)?.setData(EMPTY_FC);
    (map?.getSource(PACKET_FLOW_COMET_SOURCE_ID) as GeoJSONSource | undefined)?.setData(EMPTY_FC);
  }, [resetKey, mapRef]);

  // remove both layers + sources on unmount (runs before useMapLibre's map.remove())
  useEffect(() => {
    const map = mapRef.current;
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (!map) return;
      try {
        for (const id of [PACKET_FLOW_LAYER_ID, PACKET_FLOW_COMET_LAYER_ID]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const id of [PACKET_FLOW_SOURCE_ID, PACKET_FLOW_COMET_SOURCE_ID]) {
          if (map.getSource(id)) map.removeSource(id);
        }
      } catch {
        // map may already be torn down
      }
    };
  }, [mapRef]);
}
