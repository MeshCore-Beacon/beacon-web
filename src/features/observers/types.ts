export interface ObserverSummary {
  id: string;
  displayName?: string;
  observerType?: string;
  iata: string;
  status: "online" | "offline";
  radio?: string; // compact "freq,bw,sf" string, e.g. "915.0,250,11"; absent when unknown
  scopes?: string[]; // transport scopes this observer forwards, e.g. ["#bc", "#west"]
  // epoch ms; not in REST list responses — patched in from WS status events for recency derivation
  lastStatusAt?: number;
}

export interface Observer extends ObserverSummary {
  publicKey: string;
  softwareVersion?: string;
  hardwareModel?: string;
  firmwareVersion?: string;
  firmwareBuild?: string;
  radioFreqMhz?: number;
  radioSf?: number;
  radioBwKhz?: number;
  radioCr?: number;
  batteryLevel?: number;
  uptimeSeconds?: number;
  statusMetadata?: Record<string, unknown>;
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
  observationCount: number;
  brokers: ObserverBroker[];
}

export interface ObserverBroker {
  name: string;
  lastSeenAt: number;
  lastPacketAt: number;
}

// An advert packet heard by an observer, from GET /observers/{id}/adverts.
export interface AdvertObservation {
  id: number;
  packetHash: string;
  payloadType: number;
  payloadTypeName: string;
  iata: string;
  heardAt: number; // epoch ms
  rssi?: number;
  snr?: number;
  hopCount?: number;
  nodeName?: string;
  nodePublicKey?: string;
}
