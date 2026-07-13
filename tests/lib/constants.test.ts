import { describe, it, expect } from "vitest";
import { TABS, parseEnvList, filterEnabledTabs, isThemeVisible } from "../../src/lib/constants";

describe("parseEnvList", () => {
  it("returns [] for undefined or empty", () => {
    expect(parseEnvList(undefined)).toEqual([]);
    expect(parseEnvList("")).toEqual([]);
  });

  it("splits, trims, and drops empty entries", () => {
    expect(parseEnvList("Map,Nodes")).toEqual(["Map", "Nodes"]);
    expect(parseEnvList(" Map , Nodes ,, ")).toEqual(["Map", "Nodes"]);
  });
});

describe("filterEnabledTabs", () => {
  it("returns all tabs (order preserved) when nothing is disabled", () => {
    expect(filterEnabledTabs(TABS, undefined)).toEqual([...TABS]);
    expect(filterEnabledTabs(TABS, "")).toEqual([...TABS]);
  });

  it("excludes named tabs case-insensitively", () => {
    expect(filterEnabledTabs(TABS, "map,nodes")).toEqual([
      "Packets", "Channels", "Observers", "Routes", "Traces", "Analytics",
    ]);
    expect(filterEnabledTabs(TABS, "MAP , NODES")).toEqual([
      "Packets", "Channels", "Observers", "Routes", "Traces", "Analytics",
    ]);
  });

  it("ignores unknown tab names", () => {
    expect(filterEnabledTabs(TABS, "bogus")).toEqual([...TABS]);
  });

  it("can disable every tab", () => {
    expect(filterEnabledTabs(TABS, TABS.join(","))).toEqual([]);
  });
});

describe("isThemeVisible", () => {
  const empty = new Set<string>();

  it("always shows a non-hidden theme", () => {
    expect(isThemeVisible({ id: "neutral-blue" }, empty)).toBe(true);
    expect(isThemeVisible({ id: "neutral-blue", hidden: false }, empty)).toBe(true);
  });

  it("hides a hidden theme unless it is enabled", () => {
    expect(isThemeVisible({ id: "meshmapper_dark", hidden: true }, empty)).toBe(false);
    expect(isThemeVisible({ id: "meshmapper_dark", hidden: true }, new Set(["meshmapper_dark"]))).toBe(true);
  });

  it("matches enabled ids case-insensitively", () => {
    expect(isThemeVisible({ id: "MeshMapper_Dark", hidden: true }, new Set(["meshmapper_dark"]))).toBe(true);
  });
});
