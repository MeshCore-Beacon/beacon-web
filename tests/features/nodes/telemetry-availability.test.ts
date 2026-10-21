import { describe, expect, it } from "vitest";
import { parseTelemetryAvailability, hasCollectedTelemetry } from "../../../src/features/nodes/telemetry-availability";

describe("collected telemetry availability", () => {
  const key = "ab".repeat(32);
  const body = { items: [{ nodeKey: key, lastReceivedAt: 1792500000000 }], retentionDays: 30, truncated: false };
  it("requires a complete index and the repeater's full key", () => {
    const index = parseTelemetryAvailability(body);
    expect(hasCollectedTelemetry({ nodeType: 2, publicKey: key.toUpperCase() }, index)).toBe(true);
    expect(hasCollectedTelemetry({ nodeType: 1, publicKey: key }, index)).toBe(false);
    expect(hasCollectedTelemetry({ nodeType: 2, publicKey: key.slice(0, 8) }, index)).toBe(false);
    expect(hasCollectedTelemetry({ nodeType: 2, publicKey: key }, undefined)).toBe(false);
  });
  it("does not turn malformed or truncated results into a false empty catalogue", () => {
    for (const value of [null, {}, {...body, truncated: true}, {...body, retentionDays: 0}, {...body, items: [{nodeKey: "ab", lastReceivedAt: 10}]}, {...body, items: [body.items[0], body.items[0]]}]) {
      expect(() => parseTelemetryAvailability(value)).toThrow();
    }
    expect(parseTelemetryAvailability({...body, items: []}).nodes.size).toBe(0);
  });
});
