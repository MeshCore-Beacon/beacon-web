import { describe, expect, it } from "vitest";
import { filterObservers } from "../../../src/features/observers/observer-filter";
import type { ObserverSummary } from "../../../src/features/observers/types";

const now = Date.UTC(2026, 8, 30, 12);
const observers: ObserverSummary[] = [
  { id: "aaaa1111", displayName: "Roof Alpha", iata: "YOW", status: "online", observerType: "meshcore-ha", scopes: ["#yow"] },
  { id: "bbbb2222", displayName: "Bravo", iata: "YUL", status: "offline", observerType: "RemoteTerm" },
  // fetched as online, but its last status report is stale
  { id: "cccc3333", iata: "YOW", status: "online", lastStatusAt: now - 10 * 60_000 },
];
const ids = (list: ObserverSummary[]) => list.map((o) => o.id);
const none = { search: "", status: "", type: "", scope: "" };

describe("filterObservers", () => {
  it("keeps everything with no filters", () => {
    expect(ids(filterObservers(observers, none, now))).toEqual(["aaaa1111", "bbbb2222", "cccc3333"]);
  });
  it("searches the display name, falling back to the short id", () => {
    expect(ids(filterObservers(observers, { ...none, search: "roof" }, now))).toEqual(["aaaa1111"]);
    expect(ids(filterObservers(observers, { ...none, search: "CCCC" }, now))).toEqual(["cccc3333"]);
  });
  it("filters status by recency, not just the fetched value", () => {
    expect(ids(filterObservers(observers, { ...none, status: "offline" }, now))).toEqual(["bbbb2222", "cccc3333"]);
  });
  it("filters by type and scope", () => {
    expect(ids(filterObservers(observers, { ...none, type: "RemoteTerm" }, now))).toEqual(["bbbb2222"]);
    expect(ids(filterObservers(observers, { ...none, scope: "#yow" }, now))).toEqual(["aaaa1111"]);
  });
});
