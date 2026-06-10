import { describe, it, expect } from "vitest";
import { deriveObserverStatus, OBSERVER_ONLINE_WINDOW_MS } from "../../../src/features/observers/observer-status";

const now = 1_750_000_000_000;

describe("deriveObserverStatus", () => {
  it("derives offline when lastStatusAt is 10 minutes old, even if the fetched status says online", () => {
    expect(deriveObserverStatus({ status: "online", lastStatusAt: now - 10 * 60_000 }, now)).toBe("offline");
  });

  it("derives online when lastStatusAt is fresh, even if the fetched status says offline", () => {
    expect(deriveObserverStatus({ status: "offline", lastStatusAt: now - 60_000 }, now)).toBe("online");
  });

  it("flips to offline at exactly the window edge (server rule is strictly within 5 minutes)", () => {
    expect(deriveObserverStatus({ status: "online", lastStatusAt: now - OBSERVER_ONLINE_WINDOW_MS }, now)).toBe("offline");
    expect(deriveObserverStatus({ status: "online", lastStatusAt: now - OBSERVER_ONLINE_WINDOW_MS + 1 }, now)).toBe("online");
  });

  it("falls back to the fetched status when the row carries no timestamp", () => {
    expect(deriveObserverStatus({ status: "online" }, now)).toBe("online");
    expect(deriveObserverStatus({ status: "offline" }, now)).toBe("offline");
  });
});
