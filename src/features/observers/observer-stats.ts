import type { Observer } from "./types";

export interface Stats {
  noise_floor?: number;
  rx_air_secs?: number;
  tx_air_secs?: number;
  queue_len?: number;
  recv_errors?: number;
  errors?: number;
  internal_heap?: number;
}

// stats shape depends on the observer's firmware, so we just grab what we recognize
export function getStats(metadata: Record<string, unknown> | undefined): Stats | null {
  if (!metadata?.stats || typeof metadata.stats !== "object") return null;
  return metadata.stats as Stats;
}

export function observerNoiseFloor(observer: Pick<Observer, "statusMetadata">): number | null {
  const stats = getStats(observer.statusMetadata);
  return stats && typeof stats.noise_floor === "number" && Number.isFinite(stats.noise_floor) ? stats.noise_floor : null;
}
