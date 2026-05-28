import type { PathConfidence } from "./enums";

// response wrappers

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface LatestObserver {
  id: string;
  displayName: string;
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
  latestObserver: LatestObserver;
  summary: string;
}

export interface ResolvedHop {
  confidence: PathConfidence;
  node?: {
    id: string;
    name: string;
    publicKey: string;
    latitude: number | null;
    longitude: number | null;
  };
  candidates?: Array<{
    id: string;
    name: string;
    publicKey: string;
  }>;
  idBytes?: string;
}

export interface Observation {
  id: number;
  observerId: string;
  observerName: string;
  iata: string;
  heardAt: number;
  pathLengthByte: number;
  hashSize: number;
  hopCount: number;
  pathBytes: string;
  rawPacket: string;
  rssi: number | null;
  snr: number | null;
  propagationTimeMs: number | null;
  radio: {
    freqMhz: number;
    spreadFactor: number;
    bandwidthKhz: number;
    codingRate: number;
  } | null;
  sourceBroker: string;
  resolvedPath: ResolvedHop[];
}

export interface PacketDetail {
  packetHash: string;
  headerByte: string;
  payloadType: number;
  payloadVersion: number;
  routeType: number;
  transportCodes: { regionCode: number; subRegionCode: number } | null;
  originPubkey: string | null;
  parsedPayload: Record<string, unknown> | null;
  rawPayload: string;
  decrypted: boolean;
  channelHash: string | null;
  summary: string;
  firstHeardAt: number;
  lastHeardAt: number;
  observations: Observation[];
}

// region metadata

export interface IataCode {
  iata: string;
  displayName: string | null;
  approxLat: number | null;
  approxLng: number | null;
}

export interface BrokerStatus {
  name: string;
  connected: boolean;
}
