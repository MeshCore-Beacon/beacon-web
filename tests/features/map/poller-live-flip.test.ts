import { describe, it, expect } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";
import { patchNodePages } from "../../../src/features/nodes/node-updates";
import { nodesToFeatureCollection, filterByPoller } from "../../../src/features/map/node-geojson";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { CursorPage } from "../../../src/types/api";
import type { WsNodeUpdate } from "../../../src/types/ws";

const base: NodeSummary = { id: "n1", publicKey: "pk", nodeType: 1, nodeTypeName: "repeater", name: "N1", lat: 45, lng: -75, iatas: [] };
const cache: InfiniteData<CursorPage<NodeSummary>> = {
  pages: [{ items: [base, { ...base, id: "n2", name: "N2" }], nextCursor: null, hasMore: false }],
  pageParams: [undefined],
};
const update = (isPoller: boolean): WsNodeUpdate["data"] =>
  ({ nodeId: "n1", publicKey: "pk", name: "N1", nodeType: 1, nodeTypeName: "repeater", iata: "YOW", lat: 45, lng: -75, isObserver: true, isPoller, iatas: [] });
const shown = (data: typeof cache | undefined) =>
  filterByPoller(nodesToFeatureCollection(data!.pages.flatMap((p) => p.items)), true).features.map((f) => f.properties.id);

describe("map Pollers only follows live updates", () => {
  it("adds a node when it becomes a poller and drops it when the flag clears", () => {
    expect(shown(cache)).toEqual([]);
    const on = patchNodePages(cache, update(true));
    expect(shown(on)).toEqual(["n1"]);
    const off = patchNodePages(on, update(false));
    expect(shown(off)).toEqual([]);
  });
});
