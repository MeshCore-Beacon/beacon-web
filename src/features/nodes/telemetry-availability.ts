import type { NodeSummary } from "./types";

export interface TelemetryAvailability {
  nodes: Map<string, number>;
  retentionDays: number;
}

export function parseTelemetryAvailability(value: unknown): TelemetryAvailability {
  if (!value || typeof value !== "object") throw new Error("Telemetry availability is unavailable");
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.items) || data.items.length > 5000 || data.truncated !== false ||
      typeof data.retentionDays !== "number" || !Number.isInteger(data.retentionDays) || data.retentionDays < 1 || data.retentionDays > 366) {
    throw new Error("Telemetry availability is incomplete");
  }
  const nodes = new Map<string, number>();
  for (const item of data.items) {
    if (!item || typeof item !== "object" || typeof item.nodeKey !== "string" || !/^[0-9a-f]{64}$/.test(item.nodeKey) ||
        typeof item.lastReceivedAt !== "number" || !Number.isSafeInteger(item.lastReceivedAt) || item.lastReceivedAt <= 0 || nodes.has(item.nodeKey)) {
      throw new Error("Invalid telemetry availability entry");
    }
    nodes.set(item.nodeKey, item.lastReceivedAt);
  }
  return { nodes, retentionDays: data.retentionDays };
}

export function hasCollectedTelemetry(node: Pick<NodeSummary, "nodeType" | "publicKey">, availability?: TelemetryAvailability): boolean {
  return node.nodeType === 2 && (availability?.nodes.has(node.publicKey.toLowerCase()) ?? false);
}
