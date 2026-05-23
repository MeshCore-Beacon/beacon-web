import type { LiveRoutePulse, TowerMapNode, TowerMapObserver, TowerMapRoute } from "./types";

export interface FeatureCollection {
  type: "FeatureCollection";
  features: Array<Record<string, unknown>>;
}

export function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function nodesToGeoJSON(nodes: TowerMapNode[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: nodes.filter(isMappablePoint).map((node) => ({
      type: "Feature",
      id: node.id,
      properties: {
        id: node.id,
        label: node.label,
        role: node.role,
        lastSeen: node.lastSeen,
        activityCount: node.activityCount,
        iatas: node.iatasHeardIn.join(", "),
      },
      geometry: { type: "Point", coordinates: [node.lng, node.lat] },
    })),
  };
}

export function observersToGeoJSON(observers: TowerMapObserver[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: observers.filter(isMappablePoint).map((observer) => ({
      type: "Feature",
      id: observer.id,
      properties: {
        id: observer.id,
        label: observer.label,
        type: observer.type,
        iata: observer.iata,
        online: observer.online,
        lastSeen: observer.lastSeen,
        observationCount: observer.observationCount,
      },
      geometry: { type: "Point", coordinates: [observer.lng, observer.lat] },
    })),
  };
}

export function routesToGeoJSON(routes: TowerMapRoute[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: routes.filter(isHighConfidenceMappableRoute).map((route) => ({
      type: "Feature",
      id: route.id,
      properties: {
        id: route.id,
        packetCount: route.packetCount,
        lastHeard: route.lastHeard,
        payloadTypeNames: route.payloadTypeNames.join(", "),
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [route.from.lng, route.from.lat],
          [route.to.lng, route.to.lat],
        ],
      },
    })),
  };
}

export function livePulsesToGeoJSON(pulses: LiveRoutePulse[], now: number): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pulses.filter((pulse) => pulse.expiresAt > now && isMappablePulse(pulse)).map((pulse) => ({
      type: "Feature",
      id: pulse.id,
      properties: {
        id: pulse.id,
        payloadTypeName: pulse.payloadTypeName,
        opacity: Math.max(0, Math.min(1, (pulse.expiresAt - now) / Math.max(1, pulse.expiresAt - pulse.heardAt))),
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [pulse.fromLng, pulse.fromLat],
          [pulse.toLng, pulse.toLat],
        ],
      },
    })),
  };
}

export function mapBoundsForState(nodes: TowerMapNode[], observers: TowerMapObserver[]): [[number, number], [number, number]] | null {
  const points = [
    ...nodes.filter(isMappablePoint).map((node) => [node.lng, node.lat] as [number, number]),
    ...observers.filter(isMappablePoint).map((observer) => [observer.lng, observer.lat] as [number, number]),
  ];
  if (points.length === 0) return null;

  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function isHighConfidenceMappableRoute(route: TowerMapRoute): boolean {
  return route.resolutionQuality === "high" && isMappableEndpoint(route.from) && isMappableEndpoint(route.to);
}

function isMappableEndpoint(endpoint: { lat: number; lng: number }): boolean {
  return isFiniteCoordinate(endpoint.lat, endpoint.lng);
}

function isMappablePoint(point: { lat: number; lng: number }): boolean {
  return isFiniteCoordinate(point.lat, point.lng);
}

function isMappablePulse(pulse: LiveRoutePulse): boolean {
  return isFiniteCoordinate(pulse.fromLat, pulse.fromLng) && isFiniteCoordinate(pulse.toLat, pulse.toLng);
}

function isFiniteCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
