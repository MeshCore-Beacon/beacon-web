import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { matchesFilters, toServerFilter, usePacketFilters } from "../../../src/features/packets/usePacketFilters";
import { EMPTY_FILTERS } from "../../../src/features/packets/types";
import type { PayloadTypeValue, RouteTypeValue } from "../../../src/types/enums";
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

describe("toServerFilter", () => {
  it("returns null when no server-side dimension is selected", () => {
    expect(toServerFilter(EMPTY_FILTERS)).toBeNull();
  });

  it("pushes a multi-value payload-type selection server-side", () => {
    expect(toServerFilter({ ...EMPTY_FILTERS, payloadTypes: [2, 4] as PayloadTypeValue[] })).toEqual({ payloadTypes: [2, 4] });
  });

  it("emits payloadTypes for a single selected type", () => {
    expect(toServerFilter({ ...EMPTY_FILTERS, payloadTypes: [4] as PayloadTypeValue[] })).toEqual({ payloadTypes: [4] });
  });

  it("emits routeTypes including 0 (falsy) for a selected route", () => {
    expect(toServerFilter({ ...EMPTY_FILTERS, routeTypes: [0] as RouteTypeValue[] })).toEqual({ routeTypes: [0] });
  });

  it("emits scopes for selected scopes", () => {
    expect(toServerFilter({ ...EMPTY_FILTERS, scopes: ["#bc", "#west"] })).toEqual({ scopes: ["#bc", "#west"] });
  });

  it("emits every selected dimension together", () => {
    const filters = {
      ...EMPTY_FILTERS,
      payloadTypes: [4] as PayloadTypeValue[],
      routeTypes: [1, 2] as RouteTypeValue[],
      scopes: ["#bc"],
    };
    expect(toServerFilter(filters)).toEqual({ payloadTypes: [4], routeTypes: [1, 2], scopes: ["#bc"] });
  });

  it("ignores client-only filters (observers, search)", () => {
    expect(toServerFilter({ ...EMPTY_FILTERS, observers: ["o1"] })).toBeNull();
    expect(toServerFilter({ ...EMPTY_FILTERS, search: "ab" })).toBeNull();
  });
});

function routerAt(url: string) {
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [url] }, children);
}

describe("usePacketFilters — sf param", () => {
  it("accepts sf=hash", () => {
    const { result } = renderHook(() => usePacketFilters(), { wrapper: routerAt("/?sf=hash") });
    expect(result.current.filters.searchField).toBe("hash");
  });

  it("falls back to hash for unimplemented sf values", () => {
    for (const sf of ["payload", "bogus"]) {
      const { result } = renderHook(() => usePacketFilters(), { wrapper: routerAt(`/?sf=${sf}&q=ab`) });
      expect(result.current.filters.searchField).toBe("hash");
    }
  });

  it("restores path search from a URL and can switch or clear it", () => {
    const { result } = renderHook(() => usePacketFilters(), { wrapper: routerAt("/?sf=path&q=7f%20a4&types=4") });
    expect(result.current.filters.searchField).toBe("path");
    expect(result.current.filters.search).toBe("7f a4");
    expect(result.current.filters.payloadTypes).toEqual([4]);
    act(() => result.current.setSearchField("hash"));
    expect(result.current.filters.searchField).toBe("hash");
    act(() => result.current.setSearchField("path"));
    expect(result.current.filters.searchField).toBe("path");
    act(() => result.current.clearFilters());
    expect(result.current.filters).toEqual(EMPTY_FILTERS);
  });
});

describe("matchesFilters — latest path", () => {
  const packet = (hashSize = 1, pathBytes = "007fa499"): PacketSummary => pkt({
    latestObserver: { id: "o1", iata: "YOW", pathLength: { raw: "04", hashSize, hopCount: pathBytes.length / (hashSize * 2) }, pathBytes },
  });
  const search = (value: string) => ({ ...EMPTY_FILTERS, searchField: "path" as const, search: value });

  it.each([1, 2, 3, 4])("matches whole hashes and sequences for %i-byte hops", (width) => {
    const a = "11".repeat(width), b = "22".repeat(width), c = "33".repeat(width);
    const p = packet(width, a + b + c);
    expect(matchesFilters(p, search(b))).toBe(true);
    expect(matchesFilters(p, search(`${a} ${b}`))).toBe(true);
    expect(matchesFilters(p, search(`${b}, ${c}`))).toBe(true);
    expect(matchesFilters(p, search(`${c} ${b}`))).toBe(false);
    expect(matchesFilters(p, search("44".repeat(width)))).toBe(false);
  });

  it("normalizes case and separators while keeping hop boundaries", () => {
    expect(matchesFilters(packet(), search("  7F,\tA4  "))).toBe(true);
    expect(matchesFilters(packet(), search("7F→A4"))).toBe(true);
    expect(matchesFilters(packet(), search("7fa4"))).toBe(false); // a two-byte hop, not two one-byte hops
    expect(matchesFilters(packet(2, "aabbccdd"), search("bbcc"))).toBe(false); // crosses a hop boundary
    expect(matchesFilters(packet(2, "aabbccdd"), search("aa"))).toBe(false); // partial hop
  });

  it.each(["a", "abc", "abcd0", "aabbccddeeff", "zz", "7f aabb", "7f > a4", "7f,a4,", "aa".repeat(600)])("rejects invalid query %s", (query) => {
    expect(matchesFilters(packet(), search(query))).toBe(false);
  });

  it("keeps an empty path query neutral, including packets without path metadata", () => {
    expect(matchesFilters(pkt({}), search(""))).toBe(true);
    expect(matchesFilters(pkt({ payloadType: 9 }), search("   "))).toBe(true);
  });

  it("rejects absent, invalid or inconsistent path metadata", () => {
    const p = packet();
    const observer = p.latestObserver!;
    for (const latestObserver of [undefined, { ...observer, pathLength: undefined }, { ...observer, pathBytes: undefined },
      { ...observer, pathBytes: "007fz499" }, { ...observer, pathBytes: "007fa4" },
      { ...observer, pathLength: { raw: "00", hashSize: 0, hopCount: 4 } },
      { ...observer, pathLength: { raw: "00", hashSize: 1, hopCount: 4.5 } },
      { ...observer, pathLength: { raw: "00", hashSize: 1, hopCount: 0 } }]) {
      expect(matchesFilters({ ...p, latestObserver }, search("7f"))).toBe(false);
    }
  });

  it("excludes trace SNR bytes and does not search endpoint identities", () => {
    expect(matchesFilters({ ...packet(), payloadType: 9 }, search("7f"))).toBe(false);
    const p = packet();
    p.latestObserver!.resolvedSource = { confidence: "high", nodes: [{ id: "n1", name: "aa", publicKey: "aa" }] };
    expect(matchesFilters(p, search("aa"))).toBe(false);
  });

  it("combines path matching with existing filters without adding a server search", () => {
    const p = { ...packet(), scope: "#test" };
    const filters = { ...search("7f"), scopes: ["#test"], observers: ["o1"], payloadTypes: [2] as PayloadTypeValue[] };
    expect(matchesFilters(p, filters)).toBe(true);
    expect(matchesFilters(p, { ...filters, scopes: ["#other"] })).toBe(false);
    expect(toServerFilter(search("7f"))).toBeNull();
  });
});
