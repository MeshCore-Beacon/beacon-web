import { describe, expect, it } from "vitest";
import { isBelowVersion } from "../../src/lib/version";

describe("isBelowVersion", () => {
  it("compares X.Y.Z numerically", () => {
    expect(isBelowVersion("2.0.2", "2.0.3")).toBe(true);
    expect(isBelowVersion("2.0.9", "2.0.10")).toBe(true);
    expect(isBelowVersion("1.9.9", "2.0.0")).toBe(true);
  });

  it("passes an equal or newer version", () => {
    expect(isBelowVersion("2.0.3", "2.0.3")).toBe(false);
    expect(isBelowVersion("2.1.0", "2.0.3")).toBe(false);
    expect(isBelowVersion("2.0.10", "2.0.9")).toBe(false);
  });

  it("never blocks on a missing or malformed version", () => {
    expect(isBelowVersion("2.0.2", null)).toBe(false);
    expect(isBelowVersion("2.0.2", undefined)).toBe(false);
    expect(isBelowVersion("2.0.2", "2.0")).toBe(false);
    expect(isBelowVersion("2.0.2", "v2.0.3")).toBe(false);
    expect(isBelowVersion("2.0.2", "2.0.3-rc1")).toBe(false);
    expect(isBelowVersion("dev", "2.0.3")).toBe(false);
  });
});
