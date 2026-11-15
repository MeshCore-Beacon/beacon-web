import { describe, expect, it } from "vitest";
import { hasNodeTelemetry } from "../../../src/features/nodes/telemetry";
import type { NodeTelemetry } from "../../../src/features/nodes/types";

const base: NodeTelemetry = { range: "168h", interval: "6h", polled: true, untrustedReadings: 0, points: [{ t: 1, readings: 1 }] };

describe("hasNodeTelemetry", () => {
  it("is false before the answer arrives", () => expect(hasNodeTelemetry(undefined)).toBe(false));
  it("is false for a node that was never polled", () => expect(hasNodeTelemetry({ ...base, polled: false })).toBe(false));
  it("is false for a polled node with no points in range", () => expect(hasNodeTelemetry({ ...base, points: [] })).toBe(false));
  it("is true for a polled node with one point", () => expect(hasNodeTelemetry(base)).toBe(true));
});
