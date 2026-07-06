import { describe, it, expect } from "vitest";
import { resolvedPathNodes, litOpacity, buildLitFC } from "../../../src/features/map/packet-flow";
import type { ResolvedHop } from "../../../src/types/api";

// a high-confidence hop resolved to one located node
function hop(id: string, lng: number, lat: number): ResolvedHop {
  return { confidence: "high", nodes: [{ id, publicKey: "pk", longitude: lng, latitude: lat }] };
}

describe("resolvedPathNodes", () => {
  it("returns each hop's first located node as { id, lng, lat }, in order", () => {
    const path: ResolvedHop[] = [hop("a", -75, 45), { confidence: "none", nodes: [] }, hop("b", -76, 46)];
    expect(resolvedPathNodes(path)).toEqual([
      { id: "a", lng: -75, lat: 45 },
      { id: "b", lng: -76, lat: 46 },
    ]);
  });

  it("dedupes a node that appears on more than one hop", () => {
    const path: ResolvedHop[] = [hop("a", -75, 45), hop("a", -75, 45), hop("b", -76, 46)];
    expect(resolvedPathNodes(path).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("skips hops with no located candidate", () => {
    const path: ResolvedHop[] = [{ confidence: "ambiguous", nodes: [{ id: "x", publicKey: "pk" }] }];
    expect(resolvedPathNodes(path)).toEqual([]);
  });
});

describe("litOpacity", () => {
  it("is full at the moment lit and eases to zero by fadeMs", () => {
    expect(litOpacity(1000, 1000, 4000)).toBe(1); // just lit
    expect(litOpacity(1000, 3000, 4000)).toBeCloseTo(0.5); // halfway
    expect(litOpacity(1000, 5000, 4000)).toBe(0); // fully faded
    expect(litOpacity(1000, 9000, 4000)).toBe(0); // past its life, clamped
  });
});

describe("buildLitFC", () => {
  it("emits one point feature per lit node with its current opacity", () => {
    const lit = [{ lng: -75, lat: 45, litAt: 1000 }, { lng: -76, lat: 46, litAt: 3000 }];
    const fc = buildLitFC(lit, 3000, 4000);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.geometry.coordinates).toEqual([-75, 45]);
    expect(fc.features[0]!.properties.opacity).toBeCloseTo(0.5); // lit at 1000, now 3000
    expect(fc.features[1]!.properties.opacity).toBe(1); // just lit
  });
});
