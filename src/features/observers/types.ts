export interface ObserverSummary {
  id: string;
  displayName?: string;
  observerType?: string;
  iata: string;
  status: "online" | "offline";
  radio?: string; // compact "freq,bw,sf" string, e.g. "915.0,250,11"; absent when unknown
  scopes?: string[]; // transport scopes this observer forwards, e.g. ["#bc", "#west"]
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
  lastStatusAt?: number; // epoch ms
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
