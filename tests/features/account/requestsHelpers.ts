import type { TelemetryRequest } from "../../../src/features/account/types";

export function req(over: Partial<TelemetryRequest> = {}): TelemetryRequest {
  return {
    id: "r1",
    node: { id: "node-self", publicKey: "aabbcc", name: "Hilltop" },
    status: "active",
    statusReason: "",
    statusReasonCode: "",
    hasPassword: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    poller: { observerId: "o1", name: "Valley observer" },
    latestReadingAt: 1_700_000_100_000,
    ...over,
  };
}
