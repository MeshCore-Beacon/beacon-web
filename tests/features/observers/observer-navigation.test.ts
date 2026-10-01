import { describe, expect, it } from "vitest";
import { observerDestination, observerRange } from "../../../src/features/observers/observer-navigation";

describe("observerDestination", () => {
  it("normalizes legacy analytics links without losing region or range", () => {
    const p = observerDestination(
      new URLSearchParams("tab=Analytics&statsTab=observer&observerId=abc&range=30d&iata=YOW"),
      "abc",
    );
    expect(p.get("tab")).toBe("Observers");
    expect(p.get("observer")).toBe("abc");
    expect(p.get("range")).toBe("30d");
    expect(p.get("iata")).toBe("YOW");
    expect(p.has("observerId")).toBe(false);
    expect(p.has("statsTab")).toBe(false);
  });

  it("keeps the open packet analyzer, drops other tabs' selectors and defaults the range to 7d", () => {
    const p = observerDestination(new URLSearchParams("hash=abc&analyze=1&observation=5&path=p&node=n&route=r"), "b");
    expect(Object.fromEntries(p)).toEqual({ hash: "abc", analyze: "1", observation: "5", path: "p", tab: "Observers", observer: "b", range: "7d" });
  });

  it("drops the analytics compare params so they don't ride along into the dashboard URL", () => {
    const p = observerDestination(new URLSearchParams("compareA=x&compareB=y&compareSince=1"), "b");
    expect(p.has("compareA")).toBe(false);
    expect(p.has("compareB")).toBe(false);
    expect(p.has("compareSince")).toBe(false);
  });
});

describe("observerRange", () => {
  it("accepts the ranges the server can serve", () => {
    expect(observerRange("24h")).toBe("24h");
    expect(observerRange("7d")).toBe("7d");
    expect(observerRange("30d")).toBe("30d");
  });

  it("falls back to 7d for unknown or retired values", () => {
    expect(observerRange("invalid")).toBe("7d");
    expect(observerRange("3d")).toBe("7d");
    expect(observerRange(null)).toBe("7d");
  });
});
