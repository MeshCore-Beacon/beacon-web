import { describe, it, expect } from "vitest";
import { parseMapView, buildMapParams, type MapViewSnapshot } from "../../../src/features/map/map-url";

// URLSearchParams from a build result, skipping deleted (null) keys — models what the copy button does.
function toParams(built: Record<string, string | null>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(built)) if (v !== null) p.set(k, v);
  return p;
}

describe("parseMapView", () => {
  it("is empty for no params", () => {
    expect(parseMapView(new URLSearchParams(""))).toEqual({});
  });

  it("reads lat+lng into a maplibre [lng, lat] center", () => {
    expect(parseMapView(new URLSearchParams("lat=45.32&lng=-75.66"))).toEqual({ center: [-75.66, 45.32] });
  });

  it("omits the center unless BOTH lat and lng are present", () => {
    expect(parseMapView(new URLSearchParams("lat=45.32"))).toEqual({});
    expect(parseMapView(new URLSearchParams("lng=-75.66"))).toEqual({});
  });

  it("omits an out-of-range center", () => {
    expect(parseMapView(new URLSearchParams("lat=200&lng=0"))).toEqual({});
    expect(parseMapView(new URLSearchParams("lat=0&lng=500"))).toEqual({});
    expect(parseMapView(new URLSearchParams("lat=abc&lng=0"))).toEqual({});
  });

  it("reads a valid zoom and omits an out-of-range or malformed one", () => {
    expect(parseMapView(new URLSearchParams("zoom=9.4"))).toEqual({ zoom: 9.4 });
    expect(parseMapView(new URLSearchParams("zoom=0"))).toEqual({ zoom: 0 });
    expect(parseMapView(new URLSearchParams("zoom=99"))).toEqual({});
    expect(parseMapView(new URLSearchParams("zoom=-1"))).toEqual({});
    expect(parseMapView(new URLSearchParams("zoom=abc"))).toEqual({});
  });

  it("reads clustering on/off, case-insensitively, ignoring junk", () => {
    expect(parseMapView(new URLSearchParams("clustering=on"))).toEqual({ clustered: true });
    expect(parseMapView(new URLSearchParams("clustering=OFF"))).toEqual({ clustered: false });
    expect(parseMapView(new URLSearchParams("clustering=maybe"))).toEqual({});
  });

  it("reads node_type by canonical name, case-insensitively, and drops unknown/All", () => {
    expect(parseMapView(new URLSearchParams("node_type=repeater"))).toEqual({ nodeType: "repeater" });
    expect(parseMapView(new URLSearchParams("node_type=Repeater"))).toEqual({ nodeType: "repeater" });
    expect(parseMapView(new URLSearchParams("node_type=room_server"))).toEqual({ nodeType: "room_server" });
    expect(parseMapView(new URLSearchParams("node_type=Room"))).toEqual({}); // label, not a name
    expect(parseMapView(new URLSearchParams("node_type=banana"))).toEqual({});
    expect(parseMapView(new URLSearchParams("node_type="))).toEqual({});
  });

  it("reads the 3-way neighbor_lines mode, case-insensitively", () => {
    expect(parseMapView(new URLSearchParams("neighbor_lines=on"))).toEqual({ neighborLines: "on" });
    expect(parseMapView(new URLSearchParams("neighbor_lines=Selected"))).toEqual({ neighborLines: "selected" });
    expect(parseMapView(new URLSearchParams("neighbor_lines=off"))).toEqual({ neighborLines: "off" });
    expect(parseMapView(new URLSearchParams("neighbor_lines=nope"))).toEqual({});
  });

  it("reads a known basemap style id and drops an unknown one", () => {
    expect(parseMapView(new URLSearchParams("style=positron"))).toEqual({ styleId: "positron" });
    expect(parseMapView(new URLSearchParams("style=DARK"))).toEqual({ styleId: "dark" });
    expect(parseMapView(new URLSearchParams("style=does-not-exist"))).toEqual({});
  });

  it("reads the packet-flow toggle on/off", () => {
    expect(parseMapView(new URLSearchParams("flow=on"))).toEqual({ flow: true });
    expect(parseMapView(new URLSearchParams("flow=off"))).toEqual({ flow: false });
    expect(parseMapView(new URLSearchParams("flow=x"))).toEqual({});
  });

  it("combines every param into one view", () => {
    const params = new URLSearchParams(
      "lat=53.31&lng=-113.58&zoom=9&clustering=off&node_type=repeater&neighbor_lines=on&style=liberty&flow=on",
    );
    expect(parseMapView(params)).toEqual({
      center: [-113.58, 53.31],
      zoom: 9,
      clustered: false,
      nodeType: "repeater",
      neighborLines: "on",
      styleId: "liberty",
      flow: true,
    });
  });
});

describe("buildMapParams", () => {
  const snapshot: MapViewSnapshot = {
    center: [-113.583456, 53.312345],
    zoom: 9.4567,
    clustered: false,
    nodeType: "repeater",
    neighborLines: "on",
    styleId: "liberty",
    flow: true,
  };

  it("emits every managed key with rounded camera values", () => {
    expect(buildMapParams(snapshot)).toEqual({
      lat: "53.31235",
      lng: "-113.58346",
      zoom: "9.46",
      clustering: "off",
      node_type: "repeater",
      neighbor_lines: "on",
      style: "liberty",
      flow: "on",
    });
  });

  it("deletes node_type (null) when the filter is All", () => {
    expect(buildMapParams({ ...snapshot, nodeType: "" }).node_type).toBeNull();
  });

  it("round-trips through parseMapView (modulo rounding)", () => {
    const built = buildMapParams(snapshot);
    expect(parseMapView(toParams(built))).toEqual({
      center: [-113.58346, 53.31235],
      zoom: 9.46,
      clustered: false,
      nodeType: "repeater",
      neighborLines: "on",
      styleId: "liberty",
      flow: true,
    });
  });

  it("round-trips an All-node-type snapshot (no node_type key survives)", () => {
    const built = buildMapParams({ ...snapshot, nodeType: "" });
    expect(parseMapView(toParams(built)).nodeType).toBeUndefined();
  });
});
