import { expect, it } from "vitest";
import { buildPacketPaths, packetPathsToFeatures } from "../../../src/features/map/packet-path";
import { resolvedPathNodes } from "../../../src/features/map/packet-flow";
import type { PacketDetail, ResolvedHop } from "../../../src/types/api";

const hop = (id: string): ResolvedHop => ({ confidence: "high", nodes: [{ id, publicKey: id, latitude: 45, longitude: -75 + Number(id) }] });
function detail(hops: ResolvedHop[]): PacketDetail {
  return { header: { payloadType: 2 }, observations: [{ id: 1, observerId: "observer", resolvedPath: hops }] } as unknown as PacketDetail;
}
it("does not choose the located candidate in an ambiguous relay", () => {
  const ambiguous: ResolvedHop = { confidence: "ambiguous", nodes: [{ id: "unknown", publicKey: "a" }, ...hop("1").nodes] };
  const paths = buildPacketPaths(detail([hop("0"), ambiguous, hop("2"), hop("3")]));
  expect(paths[0].points.map(p => p.id)).toEqual(["0", "2", "3"]);
  expect(packetPathsToFeatures(paths, null).lines.features.map(f => f.geometry.coordinates)).toEqual([[[-73,45],[-72,45]]]);
});
it("keeps isolated known locations without drawing a link over an unknown hop", () => {
  const paths = buildPacketPaths(detail([hop("0"), { confidence: "none", nodes: [] }, hop("2")]));
  const data = packetPathsToFeatures(paths, null);
  expect(data.lines.features).toHaveLength(0);
  expect(data.points.features).toHaveLength(2);
  expect(resolvedPathNodes([hop("0"), { confidence: "none", nodes: [] }, hop("2")])).toEqual([]);
});
