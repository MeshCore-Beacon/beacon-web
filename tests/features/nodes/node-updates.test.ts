import { describe, it, expect } from "vitest";
import { patchNodeSummary, upsertNodePages } from "../../../src/features/nodes/node-updates";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { WsNodeUpdate } from "../../../src/types/ws";
import type { InfiniteData } from "@tanstack/react-query";
import type { CursorPage } from "../../../src/types/api";

function node(overrides: Partial<NodeSummary>): NodeSummary {
  return {
    id: "n1",
    publicKey: "pk",
    nodeType: 1,
    nodeTypeName: "repeater",
    name: "Node 1",
    lat: 45,
    lng: -75,
    iatas: [],
    ...overrides,
  };
}

function update(overrides: Partial<WsNodeUpdate["data"]>): WsNodeUpdate["data"] {
  return { nodeId: "n1", name: "New", nodeType: 1, iata: "YOW", ...overrides };
}

describe("patchNodeSummary", () => {
  it("applies foreign status changes without moving coordinates and clears explicit null", () => {
    const list = [node({ id: "a", name: "Keep", lat: 10, lng: 20, possiblyForeign: true })];
    const local = patchNodeSummary(list, update({ nodeId: "a", name: "Keep", lat: 10, lng: 20, possiblyForeign: false }))!;
    expect(local[0]!.possiblyForeign).toBe(false);
    expect(local).not.toBe(list);
    const unknown = patchNodeSummary(local, update({ nodeId: "a", name: "Keep", lat: 0, lng: 0, possiblyForeign: null }))!;
    expect(unknown[0]!.possiblyForeign).toBeUndefined();
    expect(list[0]!.possiblyForeign).toBe(true);
  });

  it("retains the flag and list identity when an advert omits the position/classification", () => {
    const list = [node({ id: "a", name: "Keep", lat: 10, lng: 20, possiblyForeign: true })];
    expect(patchNodeSummary(list, update({ nodeId: "a", name: "Keep", lat: undefined, lng: undefined }))).toBe(list);
  });
  it("returns the list unchanged (same ref) when it is undefined", () => {
    expect(patchNodeSummary(undefined, update({}))).toBeUndefined();
  });

  it("returns the same list when the node is not present (no new rows)", () => {
    const list = [node({ id: "a" })];
    expect(patchNodeSummary(list, update({ nodeId: "missing" }))).toBe(list);
  });

  it("patches name/lat/lng of the matching node immutably", () => {
    const list = [node({ id: "a", name: "Old" }), node({ id: "b" })];
    const out = patchNodeSummary(list, update({ nodeId: "b", name: "Renamed", lat: 50, lng: -80 }))!;
    expect(out).not.toBe(list);
    expect(out[0]).toBe(list[0]); // untouched node keeps its reference
    expect(out[1]).toMatchObject({ id: "b", name: "Renamed", lat: 50, lng: -80 });
  });

  it("keeps the previous name when the update name is empty", () => {
    const list = [node({ id: "a", name: "Keep" })];
    const out = patchNodeSummary(list, update({ nodeId: "a", name: "" }))!;
    expect(out[0]!.name).toBe("Keep");
  });

  it("keeps the previous lat/lng when the update omits them", () => {
    const list = [node({ id: "a", lat: 10, lng: 20 })];
    const out = patchNodeSummary(list, update({ nodeId: "a", lat: undefined, lng: undefined }))!;
    expect(out[0]!.lat).toBe(10);
    expect(out[0]!.lng).toBe(20);
  });

  it("returns the same list ref when the update changes nothing (no needless repaint)", () => {
    const list = [node({ id: "a", name: "Keep", lat: 10, lng: 20 })];
    // re-advert with identical name + omitted coords: every field resolves back to the prev value
    const out = patchNodeSummary(list, update({ nodeId: "a", name: "Keep", lat: undefined, lng: undefined }));
    expect(out).toBe(list);
  });

  it("returns the same list ref when an empty name resolves to the unchanged previous name", () => {
    const list = [node({ id: "a", name: "Keep", lat: 10, lng: 20 })];
    const out = patchNodeSummary(list, update({ nodeId: "a", name: "", lat: 10, lng: 20 }));
    expect(out).toBe(list);
  });
});

describe("upsertNodePages", () => {
  const pages = (...lists: NodeSummary[][]): InfiniteData<CursorPage<NodeSummary>> => ({
    pages: lists.map((items, i) => ({ items, nextCursor: i + 1 })),
    pageParams: lists.map((_, i) => i),
  });

  it("patches a known node in place", () => {
    const old = pages([node({ id: "a", name: "Old" })]);
    const out = upsertNodePages(old, update({ nodeId: "a", name: "Renamed" }))!;
    expect(out.pages[0]!.items[0]).toMatchObject({ id: "a", name: "Renamed" });
  });

  it("appends an unknown node to the last page — the WS event carries a full summary", () => {
    const old = pages([node({ id: "a" })], [node({ id: "b" })]);
    const out = upsertNodePages(
      old,
      update({ nodeId: "new1", name: "Fresh", nodeTypeName: "repeater", publicKey: "pk2", lat: 50.5, lng: -100.25, isObserver: false, iatas: [], possiblyForeign: true }),
    )!;
    expect(out).not.toBe(old);
    expect(out.pages[0]).toBe(old.pages[0]); // earlier pages keep their refs
    expect(out.pages[1]!.items.map((n) => n.id)).toEqual(["b", "new1"]);
    expect(out.pages[1]!.items[1]).toMatchObject({ name: "Fresh", lat: 50.5, lng: -100.25, possiblyForeign: true });
  });

  it("keeps the same ref for a re-advert that changes nothing", () => {
    const old = pages([node({ id: "a", name: "Keep", lat: 10, lng: 20 })]);
    expect(upsertNodePages(old, update({ nodeId: "a", name: "Keep", lat: undefined, lng: undefined }))).toBe(old);
  });

  it("passes undefined caches through", () => {
    expect(upsertNodePages(undefined, update({}))).toBeUndefined();
  });
});
