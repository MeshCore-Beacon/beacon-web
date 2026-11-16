import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WsManager } from "../../../src/api/ws-manager";

const h = vi.hoisted(() => ({
  features: { mapTelemetry: true, polling: true },
  region: { iatas: undefined as string[] | undefined, regionKey: "*", isResolved: true },
  telemetryArgs: [] as unknown[][],
  geojson: [] as { features: { properties: Record<string, unknown> }[] }[],
  sampledAt: 0,
}));

vi.mock("../../../src/features/map/useMapLibre", () => ({
  useMapLibre: () => ({ containerRef: { current: null }, mapRef: { current: null }, isReady: false, error: null, nodeIconResolverRef: { current: null } }),
}));
vi.mock("../../../src/features/map/useMapNodes", () => ({
  useMapNodes: (...args: unknown[]) => {
    h.geojson.push(args[3] as (typeof h.geojson)[number]);
  },
}));
vi.mock("../../../src/features/map/useMapNeighbors", () => ({ useMapNeighbors: () => {} }));
vi.mock("../../../src/features/map/useMapBorders", () => ({ useMapBorders: () => {} }));
vi.mock("../../../src/features/map/useMapPacketFlow", () => ({ useMapPacketFlow: () => {} }));
vi.mock("../../../src/features/map/useMapBordersData", () => ({ useMapBordersData: () => ({ type: "FeatureCollection", features: [] }) }));
vi.mock("../../../src/features/map/useMapNodesData", () => ({
  useMapNodesData: () => ({
    nodes: [{ id: "n1", publicKey: "k", nodeType: 2, nodeTypeName: "repeater", name: "Ridge", lat: 49, lng: -123, iatas: [], knownNeighborCount: 0 }],
    loadedCount: 1, isPaging: false, isError: false,
  }),
}));
vi.mock("../../../src/features/map/useMapTelemetry", () => ({
  useMapTelemetry: (...args: unknown[]) => {
    h.telemetryArgs.push(args);
    return args[2] ? new Map([["n1", { nodeId: "n1", sampledAt: h.sampledAt, batteryMv: 4000 }]]) : new Map();
  },
}));
vi.mock("../../../src/hooks/useFeatures", () => ({
  useFeatures: () => h.features,
  useDisplayUnits: () => ({ temperature: "c", distance: "metric" }),
}));
vi.mock("../../../src/hooks/useRegion", () => ({
  useRegion: () => h.region,
  useRegionSelection: () => ({ selection: { regions: [], iatas: [] } }),
}));
vi.mock("../../../src/hooks/useTheme", () => ({ useTheme: () => ({ themeId: "default", themes: [] }) }));
vi.mock("../../../src/hooks/useWsHandlers", () => ({ useWsNodeUpdateHandler: () => {} }));
vi.mock("../../../src/api/client", () => ({ getIatas: async () => [], getNodeNeighbors: async () => [] }));

const { MapView } = await import("../../../src/features/map/MapView");

function mount(search = "/?tab=Map") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[search]}>
        <MapView wsManager={{} as WsManager} selectedNodeId={null} onSelectNode={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const group = () => screen.getByRole("group", { name: "Show battery and temperature on the map" });
const lastLabel = () => h.geojson.at(-1)!.features[0]!.properties.telemetry;

beforeEach(() => {
  h.telemetryArgs.length = 0;
  h.geojson.length = 0;
  h.features = { mapTelemetry: true, polling: true };
  h.region = { iatas: undefined, regionKey: "*", isResolved: true };
  localStorage.clear();
  localStorage.setItem("beacon-map-settings-open", "true");
});
afterEach(() => vi.useRealTimers());

describe("MapView telemetry labels", () => {
  it("ages labels from the moment the toggle turns on, not from when the map mounted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
    h.sampledAt = Date.now() - 10 * 60_000;
    mount();
    act(() => void vi.advanceTimersByTime(2 * 3_600_000));
    fireEvent.click(within(group()).getByRole("button", { name: "On" }));
    expect(lastLabel()).toBe("4.00V  2h");
  });

  it("does not fetch readings while the region is still resolving", () => {
    localStorage.setItem("beacon-map-telemetry", "on");
    h.region = { iatas: undefined, regionKey: "*", isResolved: false };
    mount();
    expect(h.telemetryArgs.every((a) => a[2] === false)).toBe(true);
    h.telemetryArgs.length = 0;
    h.region = { iatas: undefined, regionKey: "*", isResolved: true };
    mount();
    expect(h.telemetryArgs.at(-1)![2]).toBe(true);
  });

  describe("share link", () => {
    const writeText = vi.fn();
    beforeEach(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, writable: true, configurable: true });
      writeText.mockClear();
    });

    it("keeps telemetry=on when copied before /info says the toggle is offered", () => {
      localStorage.setItem("beacon-map-telemetry", "on");
      h.features = { mapTelemetry: false, polling: false };
      mount();
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
      expect(new URL(writeText.mock.calls[0]![0] as string).searchParams.get("telemetry")).toBe("on");
    });
  });
});
