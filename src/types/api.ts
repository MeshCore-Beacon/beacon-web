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
  hashBytes?: string; // hex per-hop path-hash prefix. Not yet sent on trace hops (only RouteHop carries
  // it); reserved for when the backend populates it — unresolved trace hops fall back to #position labels.
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
  // trace packets only: the resolved intended route from the trace's path hashes (one hop per hash)
  resolvedRoute?: ResolvedHop[];
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

// known routes — fully resolved multi-hop paths discovered at ingest, where every hop matched a node
// at high confidence. One RouteHop per hash, in order.
export interface RouteHop {
  nodeId: string; // uuid of the resolved node
  hashBytes: string; // hex-encoded path-hash prefix for this hop
  node?: ResolvedNode; // node detail when the server populates it (currently omitted)
}

export interface KnownRoute {
  id: number;
  iata: string;
  hopCount: number;
  hops: RouteHop[];
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
}

// trace tags — a trace series groups the packets that share a 4-byte trace tag. The list endpoint
// returns per-tag summaries; the detail endpoint returns the tag's packets with their resolved routes.
export interface TraceTagSummary {
  traceTag: string; // hex-encoded 4-byte tag
  firstHeardAt: number; // epoch ms
  lastHeardAt: number; // epoch ms
  packetCount: number;
  iataCount: number; // distinct IATAs the tag was heard in
}

export interface TracePacket {
  packetHash: string;
  routeType: number;
  routeTypeName: string;
  scope?: string; // matched transport scope name, when any
  firstHeardAt: number; // epoch ms
  lastHeardAt: number; // epoch ms
  resolvedRoute: ResolvedHop[]; // one hop per trace path hash; nodes empty when unresolved
}

export interface TraceDetail {
  traceTag: string;
  packets: TracePacket[];
}
