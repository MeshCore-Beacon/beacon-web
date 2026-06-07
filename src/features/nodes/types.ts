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
