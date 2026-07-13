import { describe, it, expect } from "vitest";
import { TABS, parseEnvList, filterEnabledTabs, selectableThemes } from "../../src/lib/constants";

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

describe("selectableThemes", () => {
  const THEMES = [
    { id: "neutral-blue", name: "Neutral Blue" },
    { id: "teal", name: "Teal" },
    { id: "meshmapper_dark", name: "MeshMapper Dark", hidden: true },
    { id: "meshmapper_light", name: "MeshMapper Light", hidden: true },
  ];

  it("shows all non-hidden themes when no allowlist is set", () => {
    expect(selectableThemes(THEMES, new Set()).map((t) => t.id)).toEqual(["neutral-blue", "teal"]);
  });

  it("shows ONLY the allowlisted themes when set (exclusive), including hidden ones", () => {
    const ids = selectableThemes(THEMES, new Set(["meshmapper_dark", "meshmapper_light"])).map((t) => t.id);
    expect(ids).toEqual(["meshmapper_dark", "meshmapper_light"]);
  });

  it("allowlist excludes non-listed defaults", () => {
    expect(selectableThemes(THEMES, new Set(["teal"])).map((t) => t.id)).toEqual(["teal"]);
  });

  it("matches allowlist ids case-insensitively", () => {
    const themes = [{ id: "MeshMapper_Dark", hidden: true }];
    expect(selectableThemes(themes, new Set(["meshmapper_dark"])).map((t) => t.id)).toEqual(["MeshMapper_Dark"]);
  });
});
