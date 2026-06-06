import { describe, it, expect } from "vitest";
import { patchObserverSummary } from "../../../src/features/observers/observer-updates";
import type { ObserverSummary } from "../../../src/features/observers/types";
import type { WsObserverStatus } from "../../../src/types/ws";

function observer(overrides: Partial<ObserverSummary>): ObserverSummary {
  return { id: "o1", iata: "YOW", status: "offline", displayName: "Obs 1", ...overrides };
}

function update(overrides: Partial<WsObserverStatus["data"]>): WsObserverStatus["data"] {
  return {
    observerId: "o1",
    displayName: "New",
    iata: "YOW",
    online: true,
    batteryMv: null,
    uptimeSeconds: null,
    lastStatusAt: 0,
    fields: [],
    ...overrides,
  };
}

describe("patchObserverSummary", () => {
  it("returns undefined when the list is undefined", () => {
    expect(patchObserverSummary(undefined, update({}))).toBeUndefined();
  });

  it("returns the same list (same ref) when the observer is not present", () => {
    const list = [observer({ id: "a" })];
    expect(patchObserverSummary(list, update({ observerId: "missing" }))).toBe(list);
  });

  it("patches status and displayName of the matching observer immutably", () => {
    const list = [observer({ id: "a" }), observer({ id: "b", status: "offline" })];
    const out = patchObserverSummary(list, update({ observerId: "b", online: true, displayName: "Renamed" }))!;
    expect(out).not.toBe(list);
    expect(out[0]).toBe(list[0]); // untouched observer keeps its reference
    expect(out[1]).toMatchObject({ id: "b", status: "online", displayName: "Renamed" });
  });

  it("maps online=false to offline status", () => {
    const list = [observer({ id: "a", status: "online" })];
    const out = patchObserverSummary(list, update({ observerId: "a", online: false }))!;
    expect(out[0]!.status).toBe("offline");
  });

  it("keeps the previous displayName when the update name is empty", () => {
    const list = [observer({ id: "a", displayName: "Keep" })];
    const out = patchObserverSummary(list, update({ observerId: "a", displayName: "" }))!;
    expect(out[0]!.displayName).toBe("Keep");
  });

  it("returns the same list ref when the update changes nothing (no needless re-render)", () => {
    const list = [observer({ id: "a", status: "online", displayName: "Keep" })];
    // same online state + an empty displayName that resolves back to the prev value
    const out = patchObserverSummary(list, update({ observerId: "a", online: true, displayName: "" }));
    expect(out).toBe(list);
  });
});
