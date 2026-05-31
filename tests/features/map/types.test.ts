import { describe, it, expect } from "vitest";
import {
  MAP_STYLES,
  DEFAULT_STYLE_ID,
  resolveMapStyle,
  parseMapCenter,
  parseMapZoom,
} from "../../../src/features/map/types";

describe("MAP_STYLES", () => {
  it("has unique ids", () => {
    const ids = MAP_STYLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has a non-empty OpenFreeMap https url", () => {
    for (const s of MAP_STYLES) {
      expect(s.url).toMatch(/^https:\/\/tiles\.openfreemap\.org\/styles\//);
    }
  });

  it("marks only the dark style with dark:true", () => {
    expect(MAP_STYLES.find((s) => s.id === "dark")?.dark).toBe(true);
    expect(MAP_STYLES.filter((s) => s.id !== "dark").every((s) => !s.dark)).toBe(true);
  });
});

describe("DEFAULT_STYLE_ID", () => {
  it("refers to a real MAP_STYLES entry", () => {
    expect(MAP_STYLES.some((s) => s.id === DEFAULT_STYLE_ID)).toBe(true);
  });
});

describe("parseMapCenter", () => {
  it("parses a 'lat,lon' decimal string into maplibre [lng, lat] order", () => {
    expect(parseMapCenter("45.32,-75.66")).toEqual([-75.66, 45.32]);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseMapCenter("  53.31 , -113.58 ")).toEqual([-113.58, 53.31]);
  });

  it("falls back to a neutral world center when undefined", () => {
    expect(parseMapCenter(undefined)).toEqual([0, 20]);
  });

  it("falls back on malformed input", () => {
    const fallback = parseMapCenter(undefined);
    expect(parseMapCenter("not,coords")).toEqual(fallback);
    expect(parseMapCenter("1")).toEqual(fallback);
    expect(parseMapCenter("")).toEqual(fallback);
  });

  it("falls back on out-of-range coordinates", () => {
    expect(parseMapCenter("200,500")).toEqual(parseMapCenter(undefined));
  });
});

describe("parseMapZoom", () => {
  it("parses a numeric zoom string", () => {
    expect(parseMapZoom("3.2")).toBe(3.2);
    expect(parseMapZoom(" 5 ")).toBe(5);
  });

  it("falls back on missing or malformed input", () => {
    const fallback = parseMapZoom(undefined);
    expect(parseMapZoom("")).toBe(fallback);
    expect(parseMapZoom("abc")).toBe(fallback);
  });

  it("falls back on out-of-range zoom", () => {
    const fallback = parseMapZoom(undefined);
    expect(parseMapZoom("-1")).toBe(fallback);
    expect(parseMapZoom("99")).toBe(fallback);
  });
});

describe("resolveMapStyle", () => {
  it("returns the matching style for a known id", () => {
    expect(resolveMapStyle("positron").id).toBe("positron");
  });

  it("falls back to the first style for an unknown/stale id", () => {
    expect(resolveMapStyle("does-not-exist")).toBe(MAP_STYLES[0]);
  });

  it("resolves DEFAULT_STYLE_ID to an entry with that id", () => {
    expect(resolveMapStyle(DEFAULT_STYLE_ID).id).toBe(DEFAULT_STYLE_ID);
  });
});
