import { expect, it } from "vitest";
import { groupPacketReports, reportSelection } from "../../../src/features/packets/packet-investigation";
import type { Observation } from "../../../src/types/api";

const observation = (id: number, pathBytes?: string, hashSize = 1, hopCount = 2): Observation => ({
  id, observerId: `observer-${id}`, iata: "YOW", heardAt: id * 1000, sourceBroker: "mqtt1",
  pathBytes, pathLength: { raw: "02", hashSize, hopCount }, resolvedPath: [],
});

it("groups equal complete prefixes, preserving width, order and every report", () => {
  const groups = groupPacketReports([observation(3, "aabb"), observation(1, "AABB"), observation(2, "aabb", 2, 1), observation(4, "bbaa")]);
  expect(groups).toHaveLength(3);
  expect(groups[0].reports.map(o => o.id)).toEqual([1, 3]);
  expect(groups[0].hashes).toEqual(["AA", "BB"]);
  expect(groups[1].hashes).toEqual(["AABB"]);
});
it("never conflates missing or malformed evidence with an empty path", () => {
  const groups = groupPacketReports([observation(1, undefined, 1, 0), observation(2), observation(3, "zz00"), observation(4, "aa"), observation(5, "aabb", 0)]);
  expect(groups[0].kind).toBe("empty");
  expect(groups.filter(g => g.kind === "unavailable")).toHaveLength(4);
});
it("validates a requested report instead of silently substituting another", () => {
  const rows = [observation(1, "aabb"), observation(2, "ccdd")];
  expect(reportSelection(rows, new URLSearchParams("observation=2"), null)).toMatchObject({ selected: { id: 2 }, unavailable: false });
  for (const query of ["observation=9", "observation=1e0", "observation=-1", "observation=1&observation=2"]) {
    expect(reportSelection(rows, new URLSearchParams(query), null)).toEqual({ selected: null, unavailable: true });
  }
  expect(reportSelection(rows, new URLSearchParams(), 9)).toMatchObject({ selected: { id: 1 }, unavailable: false });
  expect(reportSelection([], new URLSearchParams(), null).selected).toBeNull();
});
