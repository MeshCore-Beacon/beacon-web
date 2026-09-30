import { describe, it, expect } from "vitest";
import { buildPathSummary } from "../../../src/features/packets/path-summary";
import type { PacketSummary } from "../../../src/types/api";
import { PayloadType } from "../../../src/types/enums";

const pkt = (over: Partial<PacketSummary> = {}): PacketSummary => ({
  packetHash: "AA11", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 0, lastHeardAt: 0, observationCount: 1, ...over,
});
const obs = (o: object) => ({ latestObserver: { id: "o1", iata: "YVR", ...o } });

describe("buildPathSummary", () => {
  it("is n/a when latestObserver is absent", () => {
    expect(buildPathSummary(pkt()).isNa).toBe(true);
  });

  it("never claims direct reception for an unknown hop count", () => {
    const s = buildPathSummary(pkt(obs({})));
    expect(s.hopLabel).toBe("n/a");
    expect(s.isNa).toBe(true);
  });

  it("labels a literal zero hop count as direct", () => {
    const s = buildPathSummary(pkt(obs({ pathLength: { raw: "00", hashSize: 1, hopCount: 0 } })));
    expect(s.hopLabel).toBe("0 hops · direct");
    expect(s.chips).toEqual([]);
    expect(s.isNa).toBe(false);
  });

  it("is n/a when pathLength is missing even if pathBytes is present", () => {
    expect(buildPathSummary(pkt(obs({ pathBytes: "7fa4" }))).isNa).toBe(true);
  });

  it("renders hex chips split by hashSize when there is no resolved path", () => {
    const s = buildPathSummary(pkt(obs({
      pathLength: { raw: "42", hashSize: 1, hopCount: 2 }, pathBytes: "7fa4",
    })));
    expect(s.hopLabel).toBe("2 hops");
    expect(s.chips).toEqual([{ kind: "hex", label: "7f" }, { kind: "hex", label: "a4" }]);
    expect(s.overflow).toBe(0);
  });

  it("drops chips when pathBytes length disagrees with hopCount x hashSize", () => {
    const s = buildPathSummary(pkt(obs({
      pathLength: { raw: "42", hashSize: 1, hopCount: 5 }, pathBytes: "7fa4",
    })));
    expect(s.hopLabel).toBe("5 hops");
    expect(s.chips).toEqual([]);
  });

  it("renders hop count with no chips when pathBytes is absent entirely", () => {
    const s = buildPathSummary(pkt(obs({
      pathLength: { raw: "43", hashSize: 1, hopCount: 3 },
    })));
    expect(s.hopLabel).toBe("3 hops");
    expect(s.chips).toEqual([]);
    expect(s.isNa).toBe(false);
  });

  it("truncates past the hop budget and counts remaining hops", () => {
    const s = buildPathSummary(pkt(obs({
      pathLength: { raw: "4e", hashSize: 1, hopCount: 14 },
      pathBytes: "000102030405060708090a0b0c0d",
    })));
    expect(s.chips).toHaveLength(5);
    expect(s.overflow).toBe(9);
  });

  it("collapses a run of unresolved hops into one chip that costs its length", () => {
    const none = { confidence: "none" as const, nodes: [] };
    const high = { confidence: "high" as const, nodes: [{ id: "n", publicKey: "ab", name: "Raven" }] };
    const s = buildPathSummary(pkt(obs({
      pathLength: { raw: "43", hashSize: 1, hopCount: 4 }, pathBytes: "00010203",
      resolvedPath: [high, none, none, high],
    })));
    expect(s.chips).toEqual([
      { kind: "node", label: "Raven", confidence: "high" },
      { kind: "unresolved-run", count: 2 },
      { kind: "node", label: "Raven", confidence: "high" },
    ]);
    expect(s.overflow).toBe(0);
  });

  it("always shows at least one chip even when the first run exceeds the budget", () => {
    const none = { confidence: "none" as const, nodes: [] };
    const s = buildPathSummary(pkt(obs({
      pathLength: { raw: "4a", hashSize: 1, hopCount: 10 },
      pathBytes: "00010203040506070809",
      resolvedPath: Array(10).fill(none),
    })));
    expect(s.chips).toEqual([{ kind: "unresolved-run", count: 10 }]);
    expect(s.overflow).toBe(0);
  });

  it("shows hop count only for TRACE packets", () => {
    const s = buildPathSummary(pkt({
      payloadType: PayloadType.TRACE,
      ...obs({ pathLength: { raw: "43", hashSize: 1, hopCount: 3 }, pathBytes: "000102" }),
    }));
    expect(s.hopLabel).toBe("3 hops");
    expect(s.chips).toEqual([]);
  });

});
