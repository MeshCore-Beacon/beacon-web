export interface TowerMapScope {
  iatas: string[];
  regionId?: number;
}

export interface TowerMapMetadata {
  basemap: "openfreemap" | string;
  routesComplete: boolean;
  routesStatus: string;
  liveDefaultEnabled: boolean;
}

export interface TowerMapNode {
  id: string;
  label: string;
  role: "companion" | "repeater" | "room_server" | "sensor" | "unknown" | string;
  lat: number;
  lng: number;
  firstSeen: number;
  lastSeen: number;
  iatasHeardIn: string[];
  activityCount: number;
}

export interface TowerMapObserver {
  id: string;
  label: string;
  type: string;
  iata: string;
  lat: number;
  lng: number;
  online: boolean;
  lastSeen: number;
  observationCount: number;
}

export interface TowerMapRouteEndpoint {
  nodeId: string;
  label: string;
  lat: number;
  lng: number;
}

export interface TowerMapRoute {
  id: string;
  from: TowerMapRouteEndpoint;
  to: TowerMapRouteEndpoint;
  packetCount: number;
  lastHeard: number;
  payloadTypeNames: string[];
  resolutionQuality: "high" | string;
}

export interface TowerMapActivitySummary {
  packets24h: number;
  observations24h: number;
  activeObservers24h: number;
  activeIatas24h: number;
  lastHeardAt: number | null;
}

export interface TowerMapState {
  serverTime: number;
  scope: TowerMapScope;
  metadata: TowerMapMetadata;
  nodes: TowerMapNode[];
  observers: TowerMapObserver[];
  routes: TowerMapRoute[];
  activitySummary: TowerMapActivitySummary;
}

export interface LiveRoutePulse {
  id: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  payloadTypeName: string;
  heardAt: number;
  expiresAt: number;
}
