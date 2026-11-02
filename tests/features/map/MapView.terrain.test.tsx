import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WsManager } from "../../../src/api/ws-manager";

const terrainArgs = vi.hoisted(() => [] as (boolean | undefined)[]);

// the GL map and its overlays are covered elsewhere; this only checks what MapView hands useMapLibre
vi.mock("../../../src/features/map/useMapLibre", () => ({
  useMapLibre: (...args: unknown[]) => {
    terrainArgs.push(args[5] as boolean | undefined);
    return { containerRef: { current: null }, mapRef: { current: null }, isReady: false, error: null, nodeIconResolverRef: { current: null } };
  },
}));
vi.mock("../../../src/features/map/useMapNodes", () => ({ useMapNodes: () => {} }));
vi.mock("../../../src/features/map/useMapNeighbors", () => ({ useMapNeighbors: () => {} }));
vi.mock("../../../src/features/map/useMapBorders", () => ({ useMapBorders: () => {} }));
vi.mock("../../../src/features/map/useMapPacketFlow", () => ({ useMapPacketFlow: () => {} }));
vi.mock("../../../src/features/map/useMapBordersData", () => ({
  useMapBordersData: () => ({ type: "FeatureCollection", features: [] }),
}));
vi.mock("../../../src/features/map/useMapNodesData", () => ({
  useMapNodesData: () => ({ nodes: [], loadedCount: 0, isPaging: false, isError: false }),
}));
vi.mock("../../../src/hooks/useRegion", () => ({
  useRegion: () => ({ iatas: undefined, regionKey: "*", isResolved: true }),
  useRegionSelection: () => ({ selection: { regions: [], iatas: [] } }),
}));
vi.mock("../../../src/hooks/useTheme", () => ({ useTheme: () => ({ themeId: "default", themes: [] }) }));
vi.mock("../../../src/hooks/useWsHandlers", () => ({ useWsNodeUpdateHandler: () => {} }));
vi.mock("../../../src/api/client", () => ({ getIatas: async () => [], getNodeNeighbors: async () => [] }));

const { MapView } = await import("../../../src/features/map/MapView");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/?tab=Map"]}>
        <MapView wsManager={{} as WsManager} selectedNodeId={null} onSelectNode={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const terrainGroup = () => screen.getByRole("group", { name: "3D terrain and hillshade" });

beforeEach(() => {
  terrainArgs.length = 0;
  localStorage.setItem("beacon-map-settings-open", "true");
});

describe("MapView terrain preference", () => {
  it("starts with terrain off", () => {
    mount();
    expect(terrainArgs.at(-1)).toBe(false);
    expect(within(terrainGroup()).getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
  });

  it("turns terrain on and remembers it on the next visit", () => {
    const view = mount();
    fireEvent.click(within(terrainGroup()).getByRole("button", { name: "On" }));
    expect(terrainArgs.at(-1)).toBe(true);
    expect(localStorage.getItem("beacon-map-terrain")).toBe("on");
    view.unmount();

    terrainArgs.length = 0;
    mount();
    expect(terrainArgs[0]).toBe(true);
    expect(within(terrainGroup()).getByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
  });

  it("remembers switching it back off", () => {
    localStorage.setItem("beacon-map-terrain", "on");
    mount();
    expect(terrainArgs[0]).toBe(true);
    fireEvent.click(within(terrainGroup()).getByRole("button", { name: "Off" }));
    expect(terrainArgs.at(-1)).toBe(false);
    expect(localStorage.getItem("beacon-map-terrain")).toBe("off");
  });
});
