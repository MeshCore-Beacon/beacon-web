import { useCallback, useEffect, useRef } from "react";
import type {
  Map as MapLibreMap,
  GeoJSONSource,
  CircleLayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
  ExpressionSpecification,
  MapLayerMouseEvent,
} from "maplibre-gl";
import type { Feature, FeatureCollection, Point, LineString } from "geojson";
import type { WsManager } from "../../api/ws-manager";
import { packetChain, resolvedPathNodes, posAtHop, trailCoords } from "./packet-flow";
import { lightNode, litFeatureCollection, stripPictographs, type LitEntry, type LiveNodeInfo } from "./live-map";
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
  LIVE_LIT_SOURCE_ID,
  LIVE_LIT_LABEL_LAYER_ID,
  LIVE_LIT_ICON_LAYER_ID,
  LIT_LABEL_SIZE,
  LIT_CLICK_MIN_GLOW,
  NODE_TYPE_NAMES,
  litIconId,
} from "./types";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };
const LIVE_TYPES: readonly string[] = NODE_TYPE_NAMES;
const NAMED_TYPES = new Set(["repeater", "companion"]);

const LIT_ICON_IMAGE = [
  "match",
  ["get", "nodeTypeName"],
  ...NODE_TYPE_NAMES.flatMap((t) => [t, litIconId(t)]),
  "",
] as unknown as ExpressionSpecification;

// one packet riding its hop path once
interface Flow {
  coords: [number, number][];
  ids: (string | null)[];
  start: number;
  lastNode: number;
}

// Live mode (MeshMapper LiveViz style): per observed packet, shoot an orange dot along its real hop
// path with a fading dashed trail. Each node the dot reaches turns into a solid lit icon (name below
// it) and fades on its own; the most recently lit one always draws on top. Lit nodes live in their
// own small source because draw order can't come from feature-state. Enabling it opts the WS
// connection into resolvedPath data.
export function useMapPacketFlow(
  mapRef: React.RefObject<MapLibreMap | null>,
  isReady: boolean,
  enabled: boolean,
  wsManager: WsManager,
  themeKey: string,
  resetKey: string,
  isDark: boolean,
  // unfiltered node index: packet hops carry no type, and a filtered-out node should still light
  nodeIndex: Map<string, LiveNodeInfo>,
  onSelectNode: (id: string) => void,
) {
  const flowsRef = useRef<Flow[]>([]);
  const litRef = useRef<Map<string, LitEntry>>(new Map());
  const seqRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const nodeIndexRef = useRef(nodeIndex);
  const onSelectNodeRef = useRef(onSelectNode);

  useEffect(() => {
    nodeIndexRef.current = nodeIndex;
    onSelectNodeRef.current = onSelectNode;
  }, [nodeIndex, onSelectNode]);

  const clearFlows = useCallback((map: MapLibreMap | null) => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    flowsRef.current = [];
    litRef.current.clear();
    // guard the whole block: on a not-yet-ready or torn-down map, getSource throws
    try {
      for (const id of [PACKET_FLOW_TRAIL_SOURCE_ID, PACKET_FLOW_DOT_SOURCE_ID, LIVE_LIT_SOURCE_ID]) {
        (map?.getSource(id) as GeoJSONSource | undefined)?.setData(EMPTY_FC);
      }
    } catch {
      // map style not ready / already removed
    }
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    // light hop k of a flow at the moment the dot reached it; unknown nodes stay dark
    function lightHop(p: Flow, k: number) {
      const id = p.ids[k];
      const info = id != null ? nodeIndexRef.current.get(id) : undefined;
      if (id == null || !info || !LIVE_TYPES.includes(info.nodeTypeName)) return;
      const [lng, lat] = p.coords[k]!;
      lightNode(litRef.current, {
        id,
        nodeTypeName: info.nodeTypeName,
        label: NAMED_TYPES.has(info.nodeTypeName) ? stripPictographs(info.name ?? "") : "",
        lng,
        lat,
        crossedAt: p.start + k * PACKET_FLOW_HOP_MS,
        seq: ++seqRef.current,
      });
    }

    function frame() {
      const map = mapRef.current;
      const now = performance.now();

      const dots: Feature<Point>[] = [];
      const lines: Feature<LineString>[] = [];

      for (let i = flowsRef.current.length - 1; i >= 0; i--) {
        const p = flowsRef.current[i]!;
        const nSeg = p.coords.length - 1;
        const t = (now - p.start) / PACKET_FLOW_HOP_MS;
        const node = Math.min(nSeg, Math.floor(t + 1e-6));
        while (p.lastNode < node) lightHop(p, ++p.lastNode);
        const headT = Math.min(t, nSeg);
        // full while the dot is travelling, then eases out after it reaches the end
        const fade = t > nSeg ? Math.max(0, 1 - (now - (p.start + nSeg * PACKET_FLOW_HOP_MS)) / PACKET_FLOW_TRAIL_FADE_MS) : 1;

        const coords = trailCoords(p.coords, headT);
        if (coords.length >= 2) {
          lines.push({ type: "Feature", properties: { a: 0.6 * fade }, geometry: { type: "LineString", coordinates: coords } });
        }
        if (t <= nSeg) {
          dots.push({ type: "Feature", properties: { r: 5, a: 1 }, geometry: { type: "Point", coordinates: posAtHop(p.coords, headT) } });
        }
        if (t > nSeg && fade <= 0) flowsRef.current.splice(i, 1);
      }

      (map?.getSource(PACKET_FLOW_TRAIL_SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: lines });
      (map?.getSource(PACKET_FLOW_DOT_SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: dots });
      (map?.getSource(LIVE_LIT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(litFeatureCollection(litRef.current, now));

      const busy = flowsRef.current.length > 0 || litRef.current.size > 0;
      rafRef.current = busy ? requestAnimationFrame(frame) : null;
    }
    rafRef.current = requestAnimationFrame(frame);
  }, [mapRef]);

  // Build the layers bottom to top (re-added after a style switch): dashed trail, lit names, lit
  // icons, then the dot's dark halo and the orange dot. Names sit under every lit icon and both
  // sort by lit order, so the newest node covers older ones and their names.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const textColor = isDark ? "#fafafa" : "#18181b";
    const halo = isDark ? "#09090b" : "#ffffff";

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

    if (!map.getSource(LIVE_LIT_SOURCE_ID)) {
      map.addSource(LIVE_LIT_SOURCE_ID, { type: "geojson", data: EMPTY_FC });
    }
    const beforeHalo = map.getLayer(PACKET_FLOW_DOT_HALO_LAYER_ID) ? PACKET_FLOW_DOT_HALO_LAYER_ID : undefined;
    if (!map.getLayer(LIVE_LIT_LABEL_LAYER_ID)) {
      map.addLayer({
        id: LIVE_LIT_LABEL_LAYER_ID,
        type: "symbol",
        source: LIVE_LIT_SOURCE_ID,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Regular"],
          "text-size": LIT_LABEL_SIZE,
          "text-anchor": "top",
          "text-offset": [0, 1.5],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "symbol-sort-key": ["get", "seq"],
          "symbol-z-order": "source",
        },
        paint: { "text-color": textColor, "text-halo-color": halo, "text-halo-width": 1.5, "text-opacity": ["get", "glow"] },
      } as SymbolLayerSpecification, beforeHalo);
    }
    map.setPaintProperty(LIVE_LIT_LABEL_LAYER_ID, "text-color", textColor);
    map.setPaintProperty(LIVE_LIT_LABEL_LAYER_ID, "text-halo-color", halo);
    if (!map.getLayer(LIVE_LIT_ICON_LAYER_ID)) {
      map.addLayer({
        id: LIVE_LIT_ICON_LAYER_ID,
        type: "symbol",
        source: LIVE_LIT_SOURCE_ID,
        layout: {
          "icon-image": LIT_ICON_IMAGE,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "symbol-sort-key": ["get", "seq"],
          "symbol-z-order": "source",
        },
        paint: { "icon-opacity": ["get", "glow"] },
      } as SymbolLayerSpecification, beforeHalo);
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
  }, [mapRef, isReady, themeKey, isDark]);

  // clicking a lit icon opens that node, like clicking its marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const onClick = (e: MapLayerMouseEvent) => {
      // an icon that has nearly faded out lets the click through to what's beneath it
      const hit = e.features?.find((f) => Number(f.properties?.["glow"]) >= LIT_CLICK_MIN_GLOW);
      const id = hit?.properties?.["id"];
      if (typeof id === "string") onSelectNodeRef.current(id);
    };
    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("click", LIVE_LIT_ICON_LAYER_ID, onClick);
    map.on("mouseenter", LIVE_LIT_ICON_LAYER_ID, setPointer);
    map.on("mouseleave", LIVE_LIT_ICON_LAYER_ID, clearPointer);
    return () => {
      map.off("click", LIVE_LIT_ICON_LAYER_ID, onClick);
      map.off("mouseenter", LIVE_LIT_ICON_LAYER_ID, setPointer);
      map.off("mouseleave", LIVE_LIT_ICON_LAYER_ID, clearPointer);
    };
  }, [mapRef, isReady]);

  // connection-wide resolvePath toggle: on while enabled, off otherwise
  useEffect(() => {
    wsManager.setResolvePath(enabled);
    return () => wsManager.setResolvePath(false);
  }, [enabled, wsManager]);

  // launch a flow per observed packet; tear the animation down when disabled
  useEffect(() => {
    if (!enabled) return;
    const map = mapRef.current;
    const unsub = wsManager.onPacketObservation((data) => {
      const obs = data.observation;
      // resolvedPath is opt-in and the toggle above lands a beat after connect, but the endpoints
      // always ship — bail rather than animate a bare source→destination hop that never happened.
      if (!obs?.resolvedPath) return;
      const nodes = resolvedPathNodes(packetChain(obs.resolvedSource, obs.resolvedPath, obs.resolvedDestination));
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

  // remove layers + sources on unmount (after useMapLibre's map.remove(), hence the try)
  useEffect(() => {
    const map = mapRef.current;
    return () => {
      clearFlows(map);
      if (!map) return;
      try {
        for (const id of [PACKET_FLOW_TRAIL_LAYER_ID, LIVE_LIT_LABEL_LAYER_ID, LIVE_LIT_ICON_LAYER_ID, PACKET_FLOW_DOT_HALO_LAYER_ID, PACKET_FLOW_DOT_LAYER_ID]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        for (const id of [PACKET_FLOW_TRAIL_SOURCE_ID, LIVE_LIT_SOURCE_ID, PACKET_FLOW_DOT_SOURCE_ID]) {
          if (map.getSource(id)) map.removeSource(id);
        }
      } catch {
        // map may already be torn down
      }
    };
  }, [mapRef, clearFlows]);
}
