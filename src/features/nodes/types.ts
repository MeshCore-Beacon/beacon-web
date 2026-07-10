export interface NodeIATA {
  iata: string;
  lastHeard: number; // unix ms
}

export interface NodeSummary {
  id: string;
  publicKey: string;
  nodeType: number;
  nodeTypeName: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  radio?: string; // compact "freq,bw,sf" string, e.g. "915.0,250,11"; absent when unknown
  defaultScope?: string; // most recently matched transport scope name, e.g. "#bc"
  iatas: NodeIATA[];
  knownNeighborCount: number; // distinct first-hop neighbors we've resolved for this node
  neighborIds?: string[]; // first-hop neighbor node ids; only present when the list request opts in (?neighbors)
  // Set when this node also runs as an observer (watches traffic for uplink). isObserver drives the
  // map's observer-pip marker variant; observerId, when present, links to that observer's detail.
  isObserver?: boolean;
  observerId?: string;
}

export interface Node extends NodeSummary {
  locationSource: string | null;
  lastAdvertAt: number | null; // epoch ms
  supportsMultibytePaths: boolean;
  supportsMultibyteTraces: boolean;
  minFirmwareVersion: string | null;
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
  metadata: Record<string, unknown> | null;
}

// First-hop neighbor of a node, from GET /nodes/{id}/neighbors (bare array, no pagination).
export interface NodeNeighbor {
  id: string;
  name?: string;
  publicKey: string; // hex-encoded prefix
  nodeType: number;
  nodeTypeName: string;
  lat?: number;
  lng?: number;
  iata: string;
  observationCount: number;
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
}

export interface NodeObservation {
  id: number;
  packetHash: string;
  payloadType: number;
  payloadTypeName: string;
  iata: string;
  heardAt: number; // epoch ms
  rssi?: number;
  snr?: number;
  hopCount?: number;
}
