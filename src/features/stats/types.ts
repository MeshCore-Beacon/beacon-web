export interface PacketVolume {
  timestamp: number;
  count: number;
  byType: Record<number, number>;
}

export interface ObserverCoverage {
  observerId: string;
  observerName: string;
  packetCount: number;
  uniqueNodes: number;
}
