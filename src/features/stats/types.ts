// Response shapes for the /stats/* endpoints and observer telemetry. Verified against beacon-server.

export interface StatsOverview {
  totalPackets: number;
  totalObservations: number;
  activeObservers: number;
  activeIatas: number;
  windowHours: number;
}

export interface ObservationPoint {
  hour: number; // epoch ms, start of the hourly bucket
  iata: string;
  observationCount: number;
  uniquePackets: number;
  activeObservers: number;
}

export interface PayloadBreakdownItem {
  payloadType: number;
  payloadTypeName: string;
  count: number;
}

export interface TopNode {
  nodeId: string;
  nodeName: string | null;
  nodeType: number;
  nodeTypeName: string;
  iata: string;
  observationCount: number;
  lastHeard: number; // epoch ms
}

export interface TopObserver {
  observerId: string;
  displayName: string | null;
  observerType: string | null;
  iata: string;
  observationCount: number;
}

export interface RadioPreset {
  preset: string; // "freqMhz,bwKhz,sf" e.g. "910.525,62.5,7"
  iata: string;
  sourceType: string; // "observer" or "node"
  count: number;
}

export interface NodeTypeCount {
  nodeType: number;
  nodeTypeName: string;
  count: number;
}

export interface ScopeStats {
  name: string; // normalized scope name e.g. "#bc"
  packetCount: number;
  observerCount: number;
  nodeCount: number;
}

export interface TelemetryPoint {
  t: number; // epoch ms
  batteryMv: number | null;
  airtimeTxPct: number | null;
  airtimeRxPct: number | null;
  noiseFloorDb: number | null;
  uptimeSeconds: number | null;
  queueLength: number | null;
  receiveErrors: number | null;
}

export interface ObserverTelemetry {
  range: string;
  interval: string;
  points: TelemetryPoint[];
}

// Sub-tab + time-range identifiers shared across the Stats page.
export type StatsTab = "mesh" | "observer" | "graph";
export type StatsRange = "24h" | "7d" | "30d";

export const RANGE_MS: Record<StatsRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};
