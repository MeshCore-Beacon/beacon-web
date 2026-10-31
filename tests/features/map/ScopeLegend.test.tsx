import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { NodeSummary } from "../../../src/features/nodes/types";
import { ScopeLegend } from "../../../src/features/map/ScopeLegend";
import { nodesToFeatureCollection } from "../../../src/features/map/node-geojson";
import { buildRepeaterScopeStyle } from "../../../src/features/map/repeater-scopes";

describe("scope legend", () => {
  it("updates from settled camera bounds and removes its subscriptions", () => {
    const fc = nodesToFeatureCollection([
      { id: "a", name: "a", nodeTypeName: "repeater", lat: 43, lng: -80, defaultScope: "#on" },
      { id: "b", name: "b", nodeTypeName: "repeater", lat: 43, lng: -120, defaultScope: "#bc" },
    ] as NodeSummary[]);
    let west = -85, east = -75;
    const callbacks = new Map<string, () => void>();
    const map = { getBounds: () => ({ getWest: () => west, getEast: () => east, getSouth: () => 40, getNorth: () => 50 }),
      on: vi.fn((event: string, callback: () => void) => callbacks.set(event, callback)),
      off: vi.fn((event: string) => callbacks.delete(event)),
    };
    const { unmount } = render(<ScopeLegend mapRef={{ current: map as unknown as MapLibreMap }} isReady geojson={fc} style={buildRepeaterScopeStyle(fc, true)} />);
    expect(screen.getByText("#on")).toBeVisible();
    expect(screen.queryByText("#bc")).not.toBeInTheDocument();
    act(() => { west = -125; east = -115; callbacks.get("moveend")!(); });
    expect(screen.getByText("#bc")).toBeVisible();
    expect(screen.queryByText("#on")).not.toBeInTheDocument();
    expect([...callbacks.keys()]).toEqual(["moveend", "resize"]);
    unmount(); expect(callbacks.size).toBe(0);
  });
});
