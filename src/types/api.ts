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
  snr?: number; // per-hop link SNR (dB) when the backend resolved it
  hashBytes?: string; // hex per-hop path-hash prefix, carried by RouteHop; trace hops get theirs from rawPath instead
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
  node?: ResolvedNode; // resolved node detail for this hop
}

export interface KnownRoute {
  id: number;
  iata: string;
  hopCount: number;
  hops: RouteHop[];
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
  observationCount: number;
}

// the boundary hop in a cross-IATA route: the link from the last node in the source IATA to the
// first node in the target IATA.
export interface CrossIATAHop {
  fromNode: ResolvedNode;
  toNode: ResolvedNode;
  fromIata: string;
  toIata: string;
  lastSeen: number; // epoch ms
}

// a route spanning two IATAs: a segment in the source IATA, the boundary hop, then a segment in the
// target IATA. From GET /routes/cross.
export interface CrossIATARoute {
  sourceSegment: RouteHop[];
  crossHop: CrossIATAHop;
  targetSegment: RouteHop[];
  totalHops: number;
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

export interface RawHop {
  hash: string; // hex per-hop path-hash prefix
  snr?: number; // per-hop link SNR (dB) when known
}

export interface TracePacket {
  packetHash: string;
  routeType: number;
  routeTypeName: string;
  scope?: string; // matched transport scope name, when any
  firstHeardAt: number; // epoch ms
  lastHeardAt: number; // epoch ms
  rawPath: RawHop[]; // one hop per trace path hash, index-aligned with resolvedRoute
  resolvedRoute: ResolvedHop[]; // one hop per trace path hash; nodes empty when unresolved
}

export interface TraceDetail {
  traceTag: string;
  packets: TracePacket[];
}
