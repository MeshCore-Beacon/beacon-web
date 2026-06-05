import { describe, it, expect } from "vitest";
import { matchesFilters } from "../../../src/features/packets/usePacketFilters";
import { EMPTY_FILTERS } from "../../../src/features/packets/types";
import type { PayloadTypeValue } from "../../../src/types/enums";
import type { PacketSummary } from "../../../src/types/api";

function pkt(over: Partial<PacketSummary>): PacketSummary {
  return {
    packetHash: "abcd1234",
    payloadType: 2,
    payloadTypeName: "TEXT_MESSAGE",
    routeType: 0,
    routeTypeName: "FLOOD",
    firstHeardAt: 0,
    lastHeardAt: 0,
    observationCount: 1,
    ...over,
  };
}

describe("matchesFilters — scope", () => {
  it("ignores scope when no scope filter is set", () => {
    expect(matchesFilters(pkt({ scope: "#bc" }), EMPTY_FILTERS)).toBe(true);
    expect(matchesFilters(pkt({ scope: undefined }), EMPTY_FILTERS)).toBe(true);
  });

  it("keeps only packets whose scope is selected", () => {
    const filters = { ...EMPTY_FILTERS, scopes: ["#bc"] };
    expect(matchesFilters(pkt({ scope: "#bc" }), filters)).toBe(true);
    expect(matchesFilters(pkt({ scope: "#west" }), filters)).toBe(false);
    expect(matchesFilters(pkt({ scope: undefined }), filters)).toBe(false); // untagged is excluded
  });

  it("matches any of several selected scopes", () => {
    const filters = { ...EMPTY_FILTERS, scopes: ["#bc", "#west"] };
    expect(matchesFilters(pkt({ scope: "#west" }), filters)).toBe(true);
    expect(matchesFilters(pkt({ scope: "#east" }), filters)).toBe(false);
  });

  it("ANDs scope with the payload-type filter", () => {
    const filters = { ...EMPTY_FILTERS, scopes: ["#bc"], payloadTypes: [4] as PayloadTypeValue[] };
    expect(matchesFilters(pkt({ scope: "#bc", payloadType: 4 }), filters)).toBe(true);
    expect(matchesFilters(pkt({ scope: "#bc", payloadType: 2 }), filters)).toBe(false); // wrong type
    expect(matchesFilters(pkt({ scope: "#west", payloadType: 4 }), filters)).toBe(false); // wrong scope
  });
});
