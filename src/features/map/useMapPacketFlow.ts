import { useCallback, useEffect, useRef } from "react";
import type { Map as MapLibreMap, GeoJSONSource, CircleLayerSpecification } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { WsManager } from "../../api/ws-manager";
import { resolvedPathToRoute, routeMetrics, buildPulseFC, pulseProgress, type Pulse } from "./packet-flow";
import {
  PACKET_FLOW_SOURCE_ID,
  PACKET_FLOW_LAYER_ID,
  PACKET_FLOW_MAX_PULSES,
  PACKET_FLOW_SEGMENT_MS,
  PACKET_FLOW_DEDUP_MS,
} from "./types";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

function paletteVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// Live "packets moving between repeaters" overlay. While enabled it turns on resolvedPath over the
// WS (setResolvePath) and animates a pulse along each observed packet's path. Geometry is pure
// (packet-flow.ts); here we own the maplibre source, the rAF loop, and the subscription.
export function useMapPacketFlow(
  mapRef: React.RefObject<MapLibreMap | null>,
  isReady: boolean,
  enabled: boolean,
  wsManager: WsManager,
  themeKey: string,
  resetKey: string,
) {
  const pulsesRef = useRef<Pulse[]>([]);
  const rafRef = useRef<number | null>(null);
  const nextIdRef = useRef(0);
  const recentRef = useRef<Map<string, number>>(new Map());

  // start the rAF loop if it's idle. The frame reschedules itself until the last pulse expires, then
  // leaves rafRef null so we stop instead of spinning on an empty source.
  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    function frame() {
      const src = mapRef.current?.getSource(PACKET_FLOW_SOURCE_ID) as GeoJSONSource | undefined;
      const now = performance.now();
      pulsesRef.current = pulsesRef.current.filter((p) => pulseProgress(p, now) <= 1);
      if (src) src.setData(buildPulseFC(pulsesRef.current, now));
      rafRef.current = pulsesRef.current.length > 0 ? requestAnimationFrame(frame) : null;
    }
    rafRef.current = requestAnimationFrame(frame);
  }, [mapRef]);

  // build the pulse source + layer; re-adds itself after every style switch, re-tints on theme change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const accent = paletteVar("--palette-primary", "#3B82F6");
    if (!map.getSource(PACKET_FLOW_SOURCE_ID)) {
      map.addSource(PACKET_FLOW_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
    }
    if (!map.getLayer(PACKET_FLOW_LAYER_ID)) {
      // no beforeId: draw on top of the node markers so the moving pulse stays visible
      map.addLayer({
        id: PACKET_FLOW_LAYER_ID,
        type: "circle",
        source: PACKET_FLOW_SOURCE_ID,
        paint: {
          "circle-radius": 5,
          "circle-color": accent,
          "circle-opacity": ["get", "opacity"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": accent,
          "circle-stroke-opacity": ["*", ["get", "opacity"], 0.5],
        },
      } as CircleLayerSpecification);
    }
    map.setPaintProperty(PACKET_FLOW_LAYER_ID, "circle-color", accent);
    map.setPaintProperty(PACKET_FLOW_LAYER_ID, "circle-stroke-color", accent);
  }, [mapRef, isReady, themeKey]);

  // connection-wide resolvePath toggle: on when enabled, off on disable/unmount
  useEffect(() => {
    wsManager.setResolvePath(enabled);
    return () => wsManager.setResolvePath(false);
  }, [enabled, wsManager]);

  // feed observed resolved paths into new pulses; tear the animation down when disabled
  useEffect(() => {
    if (!enabled) return;
    const map = mapRef.current; // stable for the component's life; used to clear the source on cleanup
    const unsub = wsManager.onPacketObservation((data) => {
      const resolved = data.observation?.resolvedPath;
      if (!resolved || resolved.length === 0) return;

      const now = performance.now();
      // many observers report the same packet — animate it once per dedup window
      const seenAt = recentRef.current.get(data.packetHash);
      if (seenAt != null && now - seenAt < PACKET_FLOW_DEDUP_MS) return;

      const coords = resolvedPathToRoute(resolved);
      if (coords.length < 2) return; // nothing to draw between
      const { cumLengths, total } = routeMetrics(coords);
      if (total === 0) return;

      // record only after we know this observation produced a pulse, so a partially-resolved report
      // doesn't suppress a later fully-resolved one for the same packet
      recentRef.current.set(data.packetHash, now);
      for (const [hash, ts] of recentRef.current) {
        if (now - ts > PACKET_FLOW_DEDUP_MS) recentRef.current.delete(hash);
      }

      pulsesRef.current.push({
        id: nextIdRef.current++,
        coords,
        cumLengths,
        total,
        startMs: now,
        durationMs: (coords.length - 1) * PACKET_FLOW_SEGMENT_MS,
      });
      if (pulsesRef.current.length > PACKET_FLOW_MAX_PULSES) {
        pulsesRef.current.splice(0, pulsesRef.current.length - PACKET_FLOW_MAX_PULSES);
      }
      startLoop();
    });

    return () => {
      unsub();
      pulsesRef.current = [];
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const src = map?.getSource(PACKET_FLOW_SOURCE_ID) as GeoJSONSource | undefined;
      src?.setData(EMPTY_FC);
    };
  }, [enabled, wsManager, mapRef, startLoop]);

  // clear in-flight pulses when the region changes (their geometry came from the old dataset)
  useEffect(() => {
    pulsesRef.current = [];
    recentRef.current.clear();
    const src = mapRef.current?.getSource(PACKET_FLOW_SOURCE_ID) as GeoJSONSource | undefined;
    src?.setData(EMPTY_FC);
  }, [resetKey, mapRef]);

  // remove the layer + source on unmount (runs before useMapLibre's map.remove())
  useEffect(() => {
    const map = mapRef.current;
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (!map) return;
      try {
        if (map.getLayer(PACKET_FLOW_LAYER_ID)) map.removeLayer(PACKET_FLOW_LAYER_ID);
        if (map.getSource(PACKET_FLOW_SOURCE_ID)) map.removeSource(PACKET_FLOW_SOURCE_ID);
      } catch {
        // map may already be torn down
      }
    };
  }, [mapRef]);
}
