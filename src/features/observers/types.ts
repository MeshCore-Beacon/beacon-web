export interface ObserverSummary {
  id: string;
  displayName?: string;
  observerType?: string;
  iata: string;
  status: "online" | "offline";
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
  lastStatusAt?: string;
  firstSeen: string;
  lastSeen: string;
  observationCount: number;
  brokers: ObserverBroker[];
}

export interface ObserverBroker {
  name: string;
  lastSeenAt: number;
  lastPacketAt: number;
}
