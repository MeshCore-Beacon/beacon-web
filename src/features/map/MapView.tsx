import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRegion } from "../../hooks/useRegion";
import type { WsManager } from "../../api/ws-manager";
import { getMapState } from "./api";
import { livePulsesFromPacketObservation } from "./live";
import {
  emptyFeatureCollection,
  livePulsesToGeoJSON,
  mapBoundsForState,
  nodesToGeoJSON,
  observersToGeoJSON,
  routesToGeoJSON,
} from "./geojson";
import {
  LIVE_LAYER,
  LIVE_SOURCE,
  NODE_CLUSTER_COUNT_LAYER,
  NODE_CLUSTER_LAYER,
  NODE_LAYER,
  NODE_SOURCE,
  OBSERVER_LAYER,
  OBSERVER_SOURCE,
  ROUTE_LAYER,
  ROUTE_SOURCE,
  addTowerMapLayers,
  setLayerVisible,
} from "./layers";
import type { LiveRoutePulse, TowerMapState } from "./types";

const OPENFREEMAP_STYLE_URL = import.meta.env.VITE_OPENFREEMAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_CENTER: [number, number] = [-96, 56];
const DEFAULT_ZOOM = 3;
const LIVE_PRUNE_MS = 500;

interface MapViewProps {
  wsManager: WsManager;
}

export function MapView({ wsManager }: MapViewProps) {
  const region = useRegion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const fittedRef = useRef(false);
  const stateRef = useRef<TowerMapState | undefined>(undefined);
  const [mapReady, setMapReady] = useState(false);
  const [showNodes, setShowNodes] = useState(true);
  const [showObservers, setShowObservers] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [livePulses, setLivePulses] = useState<LiveRoutePulse[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["map-state", region],
    queryFn: () => getMapState(region),
    refetchInterval: liveEnabled ? 15_000 : 60_000,
    staleTime: 10_000,
  });

  const counts = useMemo(() => ({
    nodes: data?.nodes.length ?? 0,
    observers: data?.observers.length ?? 0,
    routes: data?.routes.length ?? 0,
    packets: data?.activitySummary.packets24h ?? 0,
  }), [data]);

  useEffect(() => {
    stateRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    map.on("load", () => {
      addTowerMapLayers(map);
      bindMapSelection(map, setSelectedLabel);
      setMapReady(true);
    });

    return () => {
      setMapReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !data) return;

    setSourceData(map, ROUTE_SOURCE, routesToGeoJSON(data.routes));
    setSourceData(map, NODE_SOURCE, nodesToGeoJSON(data.nodes));
    setSourceData(map, OBSERVER_SOURCE, observersToGeoJSON(data.observers));

    if (!fittedRef.current) {
      fitInitialMap(map, data);
      fittedRef.current = true;
    }
  }, [data, mapReady]);

  useEffect(() => {
    fittedRef.current = false;
  }, [region]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    setLayerVisible(map, NODE_CLUSTER_LAYER, showNodes);
    setLayerVisible(map, NODE_CLUSTER_COUNT_LAYER, showNodes);
    setLayerVisible(map, NODE_LAYER, showNodes);
    setLayerVisible(map, OBSERVER_LAYER, showObservers);
    setLayerVisible(map, ROUTE_LAYER, showRoutes);
    setLayerVisible(map, LIVE_LAYER, liveEnabled);
    if (!liveEnabled) {
      setSourceData(map, LIVE_SOURCE, emptyFeatureCollection());
    }
  }, [showNodes, showObservers, showRoutes, liveEnabled, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !liveEnabled) return;
    setSourceData(map, LIVE_SOURCE, livePulsesToGeoJSON(livePulses, Date.now()));
  }, [livePulses, liveEnabled, mapReady]);

  useEffect(() => {
    if (!liveEnabled) return;

    const unsubscribe = wsManager.onPacketObservation((event) => {
      const pulses = livePulsesFromPacketObservation(event, stateRef.current);
      if (pulses.length === 0) return;
      setLivePulses((current) => [...pulses, ...current].slice(0, 120));
    });

    const pruneTimer = window.setInterval(() => {
      const now = Date.now();
      setLivePulses((current) => current.filter((pulse) => pulse.expiresAt > now));
    }, LIVE_PRUNE_MS);

    return () => {
      unsubscribe();
      window.clearInterval(pruneTimer);
    };
  }, [liveEnabled, wsManager]);

  return (
    <div className="relative flex-1 min-h-0 bg-bg-base">
      <div ref={containerRef} className="absolute inset-0" style={{ position: "absolute", inset: 0 }} />

      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2 rounded border border-border bg-bg-surface/92 px-2.5 py-2 shadow-lg backdrop-blur">
        <MapToggle label="Nodes" checked={showNodes} onChange={setShowNodes} />
        <MapToggle label="Observers" checked={showObservers} onChange={setShowObservers} />
        <MapToggle label="Routes" checked={showRoutes} onChange={setShowRoutes} />
        <MapToggle label="Live" checked={liveEnabled} onChange={handleLiveToggle} accent />
      </div>

      <div className="absolute right-3 top-3 min-w-[220px] rounded border border-border bg-bg-surface/92 px-3 py-2 font-mono text-[11px] text-text-muted shadow-lg backdrop-blur">
        <div className="flex items-center justify-between gap-4 text-text-bright">
          <span>{region === "*" ? "ALL" : region}</span>
          <span>{data?.metadata.basemap ?? "openfreemap"}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          <Stat label="NODES" value={counts.nodes} />
          <Stat label="OBS" value={counts.observers} />
          <Stat label="ROUTES" value={counts.routes} />
          <Stat label="24H PKT" value={counts.packets} />
        </div>
        <div className="mt-2 border-t border-border pt-2 text-[10px] uppercase tracking-wide">
          {isLoading ? "LOADING" : error ? "MAP API OFFLINE" : data?.metadata.routesStatus.replaceAll("_", " ") ?? "READY"}
        </div>
        {selectedLabel && <div className="mt-2 truncate text-text-normal">{selectedLabel}</div>}
      </div>
    </div>
  );

  function handleLiveToggle(enabled: boolean): void {
    setLiveEnabled(enabled);
    if (!enabled) {
      setLivePulses([]);
    }
  }
}

function MapToggle({
  label,
  checked,
  onChange,
  accent = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  accent?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3 w-3 accent-primary"
      />
      <span className={accent && checked ? "text-warn" : "text-text-normal"}>{label}</span>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <>
      <span className="text-text-dim">{label}</span>
      <span className="text-right text-text-normal">{value.toLocaleString()}</span>
    </>
  );
}

function bindMapSelection(map: maplibregl.Map, setSelectedLabel: (label: string | null) => void): void {
  map.on("click", (event) => {
    const layers = [OBSERVER_LAYER, NODE_LAYER].filter((layer) => map.getLayer(layer));
    const feature = map.queryRenderedFeatures(event.point, { layers })[0];
    const label = feature?.properties?.label;
    setSelectedLabel(typeof label === "string" ? label : null);
  });

  for (const layer of [NODE_CLUSTER_LAYER, NODE_LAYER, OBSERVER_LAYER]) {
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  }
}

function fitInitialMap(map: maplibregl.Map, state: TowerMapState): void {
  const bounds = mapBoundsForState(state.nodes, state.observers);
  if (!bounds) {
    map.jumpTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    return;
  }

  const [[minLng, minLat], [maxLng, maxLat]] = bounds;
  if (minLng === maxLng && minLat === maxLat) {
    map.jumpTo({ center: [minLng, minLat], zoom: 8 });
    return;
  }

  map.fitBounds(bounds, {
    padding: { top: 88, right: 260, bottom: 54, left: 54 },
    maxZoom: 8,
    duration: 0,
  });
}

function setSourceData(map: maplibregl.Map, sourceId: string, data: unknown): void {
  const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  source?.setData(data as never);
}
