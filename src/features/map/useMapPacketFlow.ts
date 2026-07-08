import { useCallback, useEffect, useRef } from "react";
import type { Map as MapLibreMap, GeoJSONSource, CircleLayerSpecification, LineLayerSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection, Point, LineString } from "geojson";
import type { WsManager } from "../../api/ws-manager";
import { resolvedPathNodes, posAtHop, trailCoords } from "./packet-flow";
import {
  PACKET_FLOW_TRAIL_SOURCE_ID,
  PACKET_FLOW_TRAIL_LAYER_ID,
  PACKET_FLOW_DOT_SOURCE_ID,
  PACKET_FLOW_DOT_HALO_LAYER_ID,
  PACKET_FLOW_DOT_LAYER_ID,
  PACKET_FLOW_COLOR,
  PACKET_FLOW_HOP_MS,
  PACKET_FLOW_TRAIL_FADE_MS,
  PACKET_FLOW_MAX,
  NODES_SOURCE_ID,
} from "./types";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

// one packet riding its hop path once
interface Flow {
  coords: [number, number][];
  ids: (string | null)[];
  start: number;
  lastNode: number;
}

// Live mode (MeshMapper LiveViz style): dim every node, then per observed packet shoot an orange dot
// along its real hop path with a fading dashed trail, flashing each node to full opacity as the dot
// crosses it. Enabling it opts the WS connection into resolvedPath data. Geometry is pure
// (packet-flow.ts); here we own the maplibre layers, the dimming, the rAF loop, and the subscription.
export function useMapPacketFlow(
  mapRef: React.RefObject<MapLibreMap | null>,
  isReady: boolean,
  enabled: boolean,
  wsManager: WsManager,
  themeKey: string,
  resetKey: string,
) {
  const flowsRef = useRef<Flow[]>([]);
  const litRef = useRef<Set<string>>(new Set()); // node ids currently lit (feature-state glow set)
  const rafRef = useRef<number | null>(null);

  const clearFlows = useCallback((map: MapLibreMap | null) => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    flowsRef.current = [];
    // guard the whole block: on a not-yet-ready or torn-down map, getSource/setFeatureState throw
    try {
      for (const id of litRef.current) map?.removeFeatureState({ source: NODES_SOURCE_ID, id }, "glow");
      (map?.getSource(PACKET_FLOW_TRAIL_SOURCE_ID) as GeoJSONSource | undefined)?.setData(EMPTY_FC);
      (map?.getSource(PACKET_FLOW_DOT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(EMPTY_FC);
    } catch {
      // map style not ready / already removed
    }
    litRef.current.clear();
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    function frame() {
      const map = mapRef.current;
      const now = performance.now();

      const dots: Feature<Point>[] = [];
      const lines: Feature<LineString>[] = [];
      const glowByNode = new Map<string, number>(); // node id -> glow this frame (max across packets)

      for (let i = flowsRef.current.length - 1; i >= 0; i--) {
        const p = flowsRef.current[i]!;
        const nSeg = p.coords.length - 1;
        const t = (now - p.start) / PACKET_FLOW_HOP_MS;
        const node = Math.min(nSeg, Math.floor(t + 1e-6));
        if (node > p.lastNode) p.lastNode = node;
        const headT = Math.min(t, nSeg);
        // full while the dot is travelling, then eases out with the trail after it reaches the end
        const fade = t > nSeg ? Math.max(0, 1 - (now - (p.start + nSeg * PACKET_FLOW_HOP_MS)) / PACKET_FLOW_TRAIL_FADE_MS) : 1;

        const coords = trailCoords(p.coords, headT);
        if (coords.length >= 2) {
          lines.push({ type: "Feature", properties: { a: 0.6 * fade }, geometry: { type: "LineString", coordinates: coords } });
        }
        if (t <= nSeg) {
          dots.push({ type: "Feature", properties: { r: 5, a: 1 }, geometry: { type: "Point", coordinates: posAtHop(p.coords, headT) } });
        }
        // light every node the dot has reached; they hold at full while it travels, then fade with the trail
        if (fade > 0) {
          for (let k = 0; k <= p.lastNode; k++) {
            const id = p.ids[k];
            if (id != null) glowByNode.set(id, Math.max(glowByNode.get(id) ?? 0, fade));
          }
        }
        if (t > nSeg && fade <= 0) flowsRef.current.splice(i, 1);
      }

      // apply node glows via feature-state; drop nodes that are no longer lit by any packet
      try {
        for (const [id, g] of glowByNode) map?.setFeatureState({ source: NODES_SOURCE_ID, id }, { glow: g });
        for (const id of litRef.current) {
          if (!glowByNode.has(id)) map?.removeFeatureState({ source: NODES_SOURCE_ID, id }, "glow");
        }
      } catch { /* node gone */ }
      litRef.current = new Set(glowByNode.keys());

      (map?.getSource(PACKET_FLOW_TRAIL_SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: lines });
      (map?.getSource(PACKET_FLOW_DOT_SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: dots });

      const busy = flowsRef.current.length > 0 || litRef.current.size > 0;
      rafRef.current = busy ? requestAnimationFrame(frame) : null;
    }
    rafRef.current = requestAnimationFrame(frame);
  }, [mapRef]);

  // build the trail + dot layers (re-add after a style switch); the dot is orange with a white stroke
  // and a dark halo behind it, the trail a dashed line whose opacity is data-driven
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    if (!map.getSource(PACKET_FLOW_TRAIL_SOURCE_ID)) {
      map.addSource(PACKET_FLOW_TRAIL_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(PACKET_FLOW_TRAIL_LAYER_ID)) {
      map.addLayer({
        id: PACKET_FLOW_TRAIL_LAYER_ID,
        type: "line",
        source: PACKET_FLOW_TRAIL_SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": PACKET_FLOW_COLOR, "line-width": 2.5, "line-dasharray": [2, 2], "line-opacity": ["get", "a"] },
      } as LineLayerSpecification);
    }
    if (!map.getSource(PACKET_FLOW_DOT_SOURCE_ID)) {
      map.addSource(PACKET_FLOW_DOT_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(PACKET_FLOW_DOT_HALO_LAYER_ID)) {
      map.addLayer({
        id: PACKET_FLOW_DOT_HALO_LAYER_ID,
        type: "circle",
        source: PACKET_FLOW_DOT_SOURCE_ID,
        paint: { "circle-radius": ["+", ["get", "r"], 2.4], "circle-color": "rgba(0,0,0,0.5)", "circle-opacity": ["*", ["get", "a"], 0.5], "circle-blur": 0.5 },
      } as CircleLayerSpecification);
    }
    if (!map.getLayer(PACKET_FLOW_DOT_LAYER_ID)) {
      map.addLayer({
        id: PACKET_FLOW_DOT_LAYER_ID,
        type: "circle",
        source: PACKET_FLOW_DOT_SOURCE_ID,
        paint: {
          "circle-radius": ["get", "r"],
          "circle-color": PACKET_FLOW_COLOR,
          "circle-opacity": ["get", "a"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["*", ["get", "a"], 1.1],
        },
      } as CircleLayerSpecification);
    }
  }, [mapRef, isReady, themeKey]);

  // connection-wide resolvePath toggle: on while enabled, off otherwise
  useEffect(() => {
    wsManager.setResolvePath(enabled);
    return () => wsManager.setResolvePath(false);
  }, [enabled, wsManager]);

  // Base-node dimming (fade all, lift the flashing node) is owned by useMapNodes so live mode and
  // selection focus share one opacity owner; here we only feed it the per-node glow feature-state.

  // launch a flow per observed packet; tear the animation down when disabled
  useEffect(() => {
    if (!enabled) return;
    const map = mapRef.current;
    const unsub = wsManager.onPacketObservation((data) => {
      const resolved = data.observation?.resolvedPath;
      if (!resolved) return;
      const nodes = resolvedPathNodes(resolved);
      if (nodes.length < 2) return; // need at least two located hops to animate a path
      while (flowsRef.current.length >= PACKET_FLOW_MAX) flowsRef.current.shift();
      flowsRef.current.push({
        coords: nodes.map((n) => [n.lng, n.lat] as [number, number]),
        ids: nodes.map((n) => n.id),
        start: performance.now(),
        lastNode: -1,
      });
      startLoop();
    });

    return () => {
      unsub();
      clearFlows(map);
    };
  }, [enabled, wsManager, mapRef, startLoop, clearFlows]);

  // clear on region change (paths came from the old dataset)
  useEffect(() => {
    clearFlows(mapRef.current);
  }, [resetKey, mapRef, clearFlows]);

  // remove layers + sources on unmount (runs before useMapLibre's map.remove())
  useEffect(() => {
    const map = mapRef.current;
    return () => {
      clearFlows(map);
      if (!map) return;
      try {
        for (const id of [PACKET_FLOW_TRAIL_LAYER_ID, PACKET_FLOW_DOT_HALO_LAYER_ID, PACKET_FLOW_DOT_LAYER_ID]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const id of [PACKET_FLOW_TRAIL_SOURCE_ID, PACKET_FLOW_DOT_SOURCE_ID]) {
          if (map.getSource(id)) map.removeSource(id);
        }
      } catch {
        // map may already be torn down
      }
    };
  }, [mapRef, clearFlows]);
}
