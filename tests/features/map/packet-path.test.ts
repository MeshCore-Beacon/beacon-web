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
  it("keys each path by observerId and carries propagation, fastest first", () => {
    const d = detail([
      obs(1, [hop("a", -79, 43), hop("b", -75, 45)], { observerId: "obs-slow", observerName: "Slow", propagationTimeMs: 900 }),
      obs(2, [hop("c", -80, 44), hop("d", -76, 46)], { observerId: "obs-fast", observerName: "Fast", propagationTimeMs: 100 }),
    ]);
    const paths = buildPacketPaths(d);
    expect(paths.map((p) => p.key)).toEqual(["obs-fast", "obs-slow"]); // fastest first
    expect(paths[0]).toMatchObject({ key: "obs-fast", label: "Fast", propagationMs: 100, color: PATH_COLORS[0] });
    expect(paths[1]).toMatchObject({ key: "obs-slow", propagationMs: 900, color: PATH_COLORS[1] }); // colors follow sort order
  });

  it("sorts observations with missing propagation after timed ones", () => {
    const d = detail([
      obs(1, [hop("a", -79, 43), hop("b", -75, 45)], { observerId: "obs-none" }),                       // no propagation
      obs(2, [hop("c", -80, 44), hop("d", -76, 46)], { observerId: "obs-fast", propagationTimeMs: 50 }),
    ]);
    const keys = buildPacketPaths(d).map((p) => p.key);
    expect(keys[0]).toBe("obs-fast");
    expect(keys[keys.length - 1]).toBe("obs-none"); // missing propagation sorts last
  });

  it("prepends resolvedSource and appends resolvedDestination to the observation line", () => {
    const d = detail([
      obs(1, [hop("relay", -78, 44)], {
        observerId: "obs-1", propagationTimeMs: 100,
        resolvedSource: hop("src", -79, 43),
        resolvedDestination: hop("dst", -77, 45),
      }),
    ]);
    const paths = buildPacketPaths(d);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.points.map((p) => p.id)).toEqual(["src", "relay", "dst"]);
  });

  it("draws a source->destination line for a directed message with no relay hops", () => {
    const d = detail([
      obs(1, [], {
        observerId: "obs-1", propagationTimeMs: 50,
        resolvedSource: hop("src", -79, 43),
        resolvedDestination: hop("dst", -77, 45),
      }),
    ]);
    const paths = buildPacketPaths(d);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.points.map((p) => p.id)).toEqual(["src", "dst"]);
  });

  it("dedupes a resolvedSource that matches the first relay hop", () => {
    const d = detail([
      obs(1, [hop("src", -79, 43), hop("relay", -78, 44)], {
        observerId: "obs-1", propagationTimeMs: 100,
        resolvedSource: hop("src", -79, 43),
        resolvedDestination: hop("dst", -77, 45),
      }),
    ]);
    const [path] = buildPacketPaths(d);
    expect(path!.points.map((p) => p.id)).toEqual(["src", "relay", "dst"]);
  });

  it("skips an unresolved endpoint rather than drawing a misleading line", () => {
    const d = detail([
      obs(1, [hop("relay1", -79, 43), hop("relay2", -78, 44)], {
        observerId: "obs-1", propagationTimeMs: 100,
        resolvedSource: hop("src"),                    // unlocated — no coords
        resolvedDestination: hop("dst", -77, 45),
      }),
    ]);
    const [path] = buildPacketPaths(d);
    expect(path!.points.map((p) => p.id)).toEqual(["relay1", "relay2", "dst"]);
  });

  it("draws only the trace route for TRACE packets, suppressing per-observation lines", () => {
    const d = detail(
      [obs(1, [hop("a", -79, 43), hop("b", -75, 45)], { observerId: "obs-1", propagationTimeMs: 100 })],
      {
        header: { payloadType: PayloadType.TRACE, routeType: 1 },
        resolvedRoute: [hop("e", -81, 47), hop("f", -77, 48)],
      } as unknown as Partial<PacketDetail>,
    );
    expect(buildPacketPaths(d).map((p) => p.key)).toEqual(["trace"]);
  });

  it("omits observations that resolve to fewer than 2 located hops", () => {
    const d = detail([
      obs(1, [hop("a", -79, 43), hop("x")], { observerId: "obs-1" }),
      obs(2, [hop("b", -80, 44), hop("c", -76, 46)], { observerId: "obs-2" }),
    ]);
    expect(buildPacketPaths(d).map((p) => p.key)).toEqual(["obs-2"]);
  });

  it("returns empty when nothing is drawable", () => {
    expect(buildPacketPaths(detail([obs(1, [hop("a", -79, 43)], { observerId: "obs-1" })]))).toEqual([]);
  });
});

const P: PacketPath[] = [
  { key: "1", label: "A", color: "#111", points: [
    { id: "a", lng: -79, lat: 43 }, { id: "b", lng: -78, lat: 44 }, { id: "c", lng: -77, lat: 45 },
  ] },
  { key: "2", label: "B", color: "#222", points: [
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

  it("carries the untruncated node identity as title", () => {
    const path: PacketPath = { key: "k", label: "L", color: "#111", points: [
      { id: "abcdef123456", lng: -79, lat: 43 },                 // no name -> title is the full id
      { id: "z", name: "Repeater North", lng: -78, lat: 44 },    // named -> title is the name
    ] };
    const { points } = packetPathsToFeatures([path], null);
    expect(points.features[0]!.properties.title).toBe("abcdef123456");
    expect(points.features[0]!.properties.label).toBe("abcdef"); // label stays truncated for the map
    expect(points.features[1]!.properties.title).toBe("Repeater North");
  });
});
