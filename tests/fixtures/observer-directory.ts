import type { ObserverSummary } from "../../src/features/observers/types";

export const directoryRow = (id: string, count: number | null = 100) => ({
  id, displayName: `Receiver ${id}`, iata: "YOW", status: "online" as const, observationCount: count,
});
export function directoryPage(items: (ObserverSummary & { observationCount: number | null })[], extra = {}) {
  return {
    items, hasMore: false, generatedAt: 1791162000000,
    windowStart: 1790557200000, windowEnd: 1791162000000,
    sort: "traffic" as const, effectiveSort: "traffic" as const,
    coverage: { status: "complete" as const, expectedHours: 168, completeHours: 168, partialHours: 0, missingHours: 0 },
    maxObservationCount: 1000, observerTypes: ["meshcoretomqtt", "RemoteTerm"], ...extra,
  };
}
