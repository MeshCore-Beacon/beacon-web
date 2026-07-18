import { describe, it, expect } from "vitest";
import { buildPacketPaths, PATH_COLORS, packetPathsToFeatures, type PacketPath } from "../../../src/features/map/packet-path";
import type { Observation, PacketDetail, ResolvedHop } from "../../../src/types/api";
import { PayloadType } from "../../../src/types/enums";

function hop(id: string, lng?: number, lat?: number): ResolvedHop {
  const nodes = lng != null && lat != null ? [{ id, publicKey: "pk", longitude: lng, latitude: lat }] : [];
  return { confidence: nodes.length ? "high" : "none", nodes };
}

function obs(id: number, hops: ResolvedHop[], over: Partial<Observation> = {}): Observation {
  return {
    id, observerId: `observer-${id}`, iata: "YYZ", heardAt: 0,
    pathLength: { raw: "", hashSize: 1, hopCount: hops.length },
    sourceBroker: "b", resolvedPath: hops, ...over,
  } as Observation;
}

function detail(observations: Observation[], over: Partial<PacketDetail> = {}): PacketDetail {
  return { header: { payloadType: PayloadType.TEXT, routeType: 1 }, observations, ...over } as unknown as PacketDetail;
}

describe("buildPacketPaths", () => {
  it("returns one color-coded path per observation with >=2 located hops", () => {
    const d = detail([
      obs(1, [hop("a", -79, 43), hop("b", -75, 45)], { observerName: "Alpha" }),
      obs(2, [hop("c", -80, 44), hop("d", -76, 46)]),
    ]);
    const paths = buildPacketPaths(d);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatchObject({ key: "1", label: "Alpha", hopCount: 2, color: PATH_COLORS[0] });
    expect(paths[1]).toMatchObject({ key: "2", label: "observer", color: PATH_COLORS[1] });
    expect(paths[0]!.points).toEqual([
      { id: "a", name: undefined, lng: -79, lat: 43 },
      { id: "b", name: undefined, lng: -75, lat: 45 },
    ]);
  });

  it("omits observations that resolve to fewer than 2 located hops", () => {
    const d = detail([
      obs(1, [hop("a", -79, 43), hop("x")]),          // one unlocated -> 1 point -> omitted
      obs(2, [hop("b", -80, 44), hop("c", -76, 46)]),
    ]);
    expect(buildPacketPaths(d).map((p) => p.key)).toEqual(["2"]);
  });

  it("includes the trace route for TRACE packets", () => {
    const d = detail([], {
      header: { payloadType: PayloadType.TRACE, routeType: 1 },
      resolvedRoute: [hop("a", -79, 43), hop("b", -75, 45)],
    } as unknown as Partial<PacketDetail>);
    const paths = buildPacketPaths(d);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ key: "trace", label: "Trace route", hopCount: 2 });
  });

  it("returns empty when nothing is drawable", () => {
    expect(buildPacketPaths(detail([obs(1, [hop("a", -79, 43)])]))).toEqual([]);
  });
});

const P: PacketPath[] = [
  { key: "1", label: "A", hopCount: 3, color: "#111", points: [
    { id: "a", lng: -79, lat: 43 }, { id: "b", lng: -78, lat: 44 }, { id: "c", lng: -77, lat: 45 },
  ] },
  { key: "2", label: "B", hopCount: 2, color: "#222", points: [
    { id: "d", lng: -80, lat: 46 }, { id: "e", lng: -76, lat: 47 },
  ] },
];

describe("packetPathsToFeatures", () => {
  it("emits one line per path and one point per hop, with the path color", () => {
    const { lines, points, bounds } = packetPathsToFeatures(P, null);
    expect(lines.features).toHaveLength(2);
    expect(lines.features[0]!.properties).toEqual({ key: "1", color: "#111" });
    expect(lines.features[0]!.geometry.coordinates).toEqual([[-79, 43], [-78, 44], [-77, 45]]);
    expect(points.features).toHaveLength(5);
    expect(bounds).toHaveLength(5);
  });

  it("marks first/last/middle hops as start/end/mid", () => {
    const { points } = packetPathsToFeatures([P[0]!], null);
    expect(points.features.map((f) => f.properties.endpoint)).toEqual(["start", "mid", "end"]);
    expect(points.features[0]!.properties.label).toBe("a");
  });

  it("shows only the selected path when a key is given", () => {
    const { lines, points } = packetPathsToFeatures(P, "2");
    expect(lines.features.map((f) => f.properties.key)).toEqual(["2"]);
    expect(points.features).toHaveLength(2);
  });
});
