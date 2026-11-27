import { describe, it, expect } from "vitest";
import { MAP_ICON_IDS, nodeIconSvg, nodeObserverIconId, nodePollerIconId } from "../../../src/features/map/node-icons";
import { nodeIconId, NODE_TYPE_NAMES } from "../../../src/features/map/types";

describe("poller marker icons", () => {
  it.each(NODE_TYPE_NAMES.flatMap((t) => [[t, true], [t, false]] as const))("%s (dark=%s) resolves the poller SVG, not the observer one", (type, isDark) => {
    const svg = nodeIconSvg(nodePollerIconId(type), isDark)!;
    expect(svg).toContain("#ffb454");
    expect(svg).not.toContain("#c79bff");
    expect(svg).not.toContain("--poller-color");
  });

  it("keeps the observer accent on the observer variant", () => {
    const svg = nodeIconSvg(nodeObserverIconId("repeater"), true)!;
    expect(svg).toContain("#c79bff");
    expect(svg).not.toContain("#ffb454");
  });

  it("registers a poller id for every node type", () => {
    for (const t of NODE_TYPE_NAMES) {
      expect(MAP_ICON_IDS).toContain(nodePollerIconId(t));
      expect(nodePollerIconId(t)).toBe(`${nodeIconId(t)}-poller`);
    }
  });
});
