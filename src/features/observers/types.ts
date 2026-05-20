export interface Observer {
  id: string;
  displayName: string;
  iata: string;
  online: boolean;
  lastSeenAt: number;
  brokers: string[];
  telemetry: {
    batteryPct: number | null;
    uptimeSec: number | null;
    queueDepth: number | null;
  } | null;
}
