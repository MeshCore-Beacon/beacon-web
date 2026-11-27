import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WsManager } from "../../../src/api/ws-manager";


// the GL map and its overlays are covered elsewhere; this only checks what MapView hands useMapLibre
vi.mock("../../../src/features/map/useMapLibre", () => ({
  useMapLibre: (...args: unknown[]) => {
    void args;
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

function mount(search = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/?tab=Map${search}`]}>
        <MapView wsManager={{} as WsManager} selectedNodeId={null} onSelectNode={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const group = () => screen.getByRole("group", { name: "Pollers only" });
const pressed = (name: "On" | "Off") => within(group()).getByRole("button", { name })?.getAttribute("aria-pressed");

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("beacon-map-settings-open", "true");
});

describe("MapView pollers only preference", () => {
  it("starts off with nothing stored", () => {
    mount();
    expect(pressed("Off")).toBe("true");
  });

  it("starts on when stored on and no URL param", () => {
    localStorage.setItem("beacon-map-pollers-only", "on");
    mount();
    expect(pressed("On")).toBe("true");
  });

  it("lets ?pollers=1 win without overwriting the stored value", () => {
    localStorage.setItem("beacon-map-pollers-only", "off");
    mount("&pollers=1");
    expect(pressed("On")).toBe("true");
    expect(localStorage.getItem("beacon-map-pollers-only")).toBe("off");
  });

  it("writes the stored value when toggled", () => {
    mount();
    fireEvent.click(within(group()).getByRole("button", { name: "On" }));
    expect(localStorage.getItem("beacon-map-pollers-only")).toBe("on");
    fireEvent.click(within(group()).getByRole("button", { name: "Off" }));
    expect(localStorage.getItem("beacon-map-pollers-only")).toBe("off");
  });

  it("opens a shared all-nodes view without changing a saved pollers-only preference", () => {
    localStorage.setItem("beacon-map-pollers-only", "on");
    mount("&pollers=0");
    expect(pressed("Off")).toBe("true");
    expect(localStorage.getItem("beacon-map-pollers-only")).toBe("on");
  });
});
