export interface NodeSummary {
  id: string;
  publicKey: string;
  nodeType: number;
  nodeTypeName: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
}

export interface Node extends NodeSummary {
  locationSource: string | null;
  lastAdvertAt: number | null;
  supportsMultibytePaths: boolean;
  supportsMultibyteTraces: boolean;
  minFirmwareVersion: string | null;
  firstSeen: number;
  lastSeen: number;
  metadata: Record<string, unknown> | null;
}

export interface NodeObservation {
  id: number;
  packetHash: string;
  payloadType: number;
  payloadTypeName: string;
  iata: string;
  heardAt: number;
  rssi?: number;
  snr?: number;
  hopCount?: number;
}
