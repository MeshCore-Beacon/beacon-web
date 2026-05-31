export interface NodeSummary {
  id: string;
  publicKey: string;
  nodeType: number;
  nodeTypeName: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  iatas: string[];
  // Role flag (a node that watches traffic for uplink); not populated by the API yet. When set, the
  // map gives the node its observer-pip marker variant.
  isObserver?: boolean;
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
