import type { PathConfidence } from "./enums";

// response wrappers

export interface CursorPage<T> {
  items: T[];
  nextCursor: number | null;
  hasMore: boolean;
}

export interface LatestObserver {
  id: string;
  displayName?: string;
  iata: string;
}

// packet list and detail shapes

export interface PacketSummary {
  packetHash: string;
  payloadType: number;
  payloadTypeName: string;
  routeType: number;
  routeTypeName: string;
  firstHeardAt: number;
  lastHeardAt: number;
  observationCount: number;
  latestObserver?: LatestObserver;
  scope?: string; // matched transport scope name, e.g. "#bc"
  summary?: string;
}

export interface ResolvedNode {
  id: string; // uuid
  name?: string;
  publicKey: string; // hex-encoded prefix
  latitude?: number; // decimal degrees (resolved DB value, not the 1e7 advert encoding)
  longitude?: number;
}

export interface ResolvedHop {
  confidence: PathConfidence;
  nodes: ResolvedNode[]; // empty when confidence is "none"
}

export interface PathLength {
  raw: string; // path-length byte as hex (e.g. "1e")
  hashSize: number; // bytes per hop hash
  hopCount: number;
}

export interface Observation {
  id: number;
  observerId: string;
  observerName?: string;
  iata: string;
  heardAt: number;
  pathLength: PathLength;
  pathBytes?: string;
  rssi?: number;
  snr?: number;
  propagationTimeMs?: number;
  radio?: {
    freqMhz?: number;
    spreadFactor?: number;
    bandwidthKhz?: number;
    codingRate?: number;
  };
  sourceBroker: string;
  resolvedPath: ResolvedHop[];
}

export interface PacketHeader {
  raw: string; // header byte as hex (e.g. "11")
  routeType: number;
  routeTypeName: string;
  payloadType: number;
  payloadTypeName: string;
  payloadVersion: number;
}

export interface TransportCodes {
  regionCode: number;
  subRegionCode: number;
}

export interface PacketDetail {
  packetHash: string;
  header: PacketHeader;
  transportCodes?: TransportCodes;
  scope?: string; // matched transport scope name, e.g. "#bc"
  originPubkey?: string;
  parsedPayload?: Record<string, unknown> | string;
  rawPayload: string;
  decrypted: boolean;
  channelHash?: string;
  firstHeardAt: number;
  lastHeardAt: number;
  firstToLastMs: number; // ms between first and last hearing — the packet's overall propagation time
  observationCount: number;
  observations: Observation[];
}

// region metadata

export interface IataCode {
  iata: string;
  displayName?: string;
  lat?: number;
  lon?: number;
}

// A region groups IATAs under a URL-safe slug. The list endpoint returns summaries; the detail
// endpoint adds the member IATAs and map-focus hints.
export interface RegionSummary {
  id: number;
  slug: string; // e.g. "western-canada"
  name: string;
}

export interface Region extends RegionSummary {
  description?: string;
  centerLat?: number;
  centerLng?: number;
  zoomLevel?: number;
  iatas: string[]; // member IATA codes
}

export interface BrokerStatus {
  name: string;
  connected: boolean;
}

// per-transport-scope aggregate counts from /stats/scopes; also the source of the configured scope
// names used to populate the scope filters
export interface ScopeStats {
  name: string; // normalized scope name, e.g. "#bc"
  packetCount: number;
  observerCount: number;
  nodeCount: number;
}
