import { describe, it, expect } from "vitest";
import { patchNodeSummary } from "../../../src/features/nodes/node-updates";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { WsNodeUpdate } from "../../../src/types/ws";

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
});
