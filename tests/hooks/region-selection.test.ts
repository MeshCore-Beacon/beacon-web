import { describe, it, expect } from "vitest";
import {
  ALL_REGIONS,
  isAllRegions,
  resolveIatas,
  regionKey,
  parseSelection,
  selectionToParams,
  serializeSelection,
  deserializeSelection,
  type RegionSelection,
} from "../../src/hooks/region-selection";

const regionIatas = new Map<string, string[]>([
  ["western-canada", ["YVR", "YYJ"]],
  ["cascadia", ["YVR", "SEA"]], // intentionally overlaps YVR with western-canada
]);

describe("isAllRegions", () => {
  it("is true only for an empty selection", () => {
    expect(isAllRegions(ALL_REGIONS)).toBe(true);
    expect(isAllRegions({ regions: [], iatas: [] })).toBe(true);
    expect(isAllRegions({ regions: ["cascadia"], iatas: [] })).toBe(false);
    expect(isAllRegions({ regions: [], iatas: ["YVR"] })).toBe(false);
  });
});

describe("resolveIatas", () => {
  it("returns undefined (= all) for an empty selection", () => {
    expect(resolveIatas(ALL_REGIONS, regionIatas)).toBeUndefined();
  });

  it("returns the selected IATAs sorted and deduped", () => {
    expect(resolveIatas({ regions: [], iatas: ["YYJ", "YVR", "YVR"] }, regionIatas)).toEqual(["YVR", "YYJ"]);
  });

  it("expands region slugs to their member IATAs", () => {
    expect(resolveIatas({ regions: ["western-canada"], iatas: [] }, regionIatas)).toEqual(["YVR", "YYJ"]);
  });

  it("unions regions and individual IATAs, deduping the overlap", () => {
    expect(resolveIatas({ regions: ["western-canada", "cascadia"], iatas: ["YYZ"] }, regionIatas)).toEqual([
      "SEA",
      "YVR",
      "YYJ",
      "YYZ",
    ]);
  });

  it("ignores a region slug that isn't in the map yet", () => {
    expect(resolveIatas({ regions: ["not-loaded"], iatas: ["YVR"] }, regionIatas)).toEqual(["YVR"]);
  });
});

describe("regionKey", () => {
  it("is '*' when there is no filter", () => {
    expect(regionKey(undefined)).toBe("*");
    expect(regionKey([])).toBe("*");
  });

  it("joins the resolved IATAs for a stable query key", () => {
    expect(regionKey(["YVR", "YYJ"])).toBe("YVR,YYJ");
  });
});

describe("parseSelection", () => {
  it("reads ?iata as a comma-separated, upper-cased IATA list", () => {
    expect(parseSelection(new URLSearchParams("iata=YVR,yyj"))).toEqual({ regions: [], iatas: ["YVR", "YYJ"] });
  });

  it("reads ?regions as a comma-separated slug list", () => {
    expect(parseSelection(new URLSearchParams("regions=western-canada,cascadia"))).toEqual({
      regions: ["western-canada", "cascadia"],
      iatas: [],
    });
  });

  it("folds a legacy single ?region into an IATA (back-compat with old shared links)", () => {
    expect(parseSelection(new URLSearchParams("region=yvr"))).toEqual({ regions: [], iatas: ["YVR"] });
  });

  it("combines regions and iatas, and is empty for no params", () => {
    expect(parseSelection(new URLSearchParams("regions=cascadia&iata=YYZ"))).toEqual({
      regions: ["cascadia"],
      iatas: ["YYZ"],
    });
    expect(parseSelection(new URLSearchParams(""))).toEqual(ALL_REGIONS);
  });
});

describe("selectionToParams", () => {
  it("writes iata + regions and drops the legacy region param", () => {
    const base = new URLSearchParams("region=OLD&tab=Packets");
    const next = selectionToParams({ regions: ["cascadia"], iatas: ["YVR", "YYJ"] }, base);
    expect(next.get("iata")).toBe("YVR,YYJ");
    expect(next.get("regions")).toBe("cascadia");
    expect(next.has("region")).toBe(false);
    expect(next.get("tab")).toBe("Packets"); // unrelated params are preserved
  });

  it("clears the params for the all-regions selection", () => {
    const next = selectionToParams(ALL_REGIONS, new URLSearchParams("iata=YVR&regions=cascadia"));
    expect(next.has("iata")).toBe(false);
    expect(next.has("regions")).toBe(false);
  });
});

describe("serialize/deserialize", () => {
  it("round-trips a selection", () => {
    const sel: RegionSelection = { regions: ["cascadia"], iatas: ["YVR"] };
    expect(deserializeSelection(serializeSelection(sel))).toEqual(sel);
  });

  it("falls back to all-regions on missing or malformed input", () => {
    expect(deserializeSelection(null)).toEqual(ALL_REGIONS);
    expect(deserializeSelection("not json")).toEqual(ALL_REGIONS);
    expect(deserializeSelection('{"regions":"oops"}')).toEqual(ALL_REGIONS);
  });
});
