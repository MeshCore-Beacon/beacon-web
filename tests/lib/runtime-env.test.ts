import { afterEach, describe, expect, it } from "vitest";
import { runtimeEnv } from "../../src/lib/runtime-env";

describe("runtimeEnv", () => {
  afterEach(() => {
    delete window.__BEACON_CONFIG__;
  });

  it("prefers a non-empty value from window.__BEACON_CONFIG__", () => {
    window.__BEACON_CONFIG__ = { VITE_BANNER: "from container" };
    expect(runtimeEnv("VITE_BANNER", "from build")).toBe("from container");
  });

  it("falls back to import.meta.env when the runtime value is empty or missing", () => {
    window.__BEACON_CONFIG__ = { VITE_BANNER: "" };
    expect(runtimeEnv("VITE_BANNER", "from build")).toBe("from build");
    delete window.__BEACON_CONFIG__;
    expect(runtimeEnv("VITE_BANNER", "from build")).toBe("from build");
  });

  it("ignores non-string runtime values", () => {
    window.__BEACON_CONFIG__ = { VITE_MAP_ZOOM: 7 };
    expect(runtimeEnv("VITE_MAP_ZOOM", "4")).toBe("4");
  });

  it("returns undefined when neither source has a value", () => {
    expect(runtimeEnv("VITE_NOT_SET_ANYWHERE", undefined)).toBeUndefined();
  });
});
