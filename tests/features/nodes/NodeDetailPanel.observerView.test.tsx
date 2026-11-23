import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NodeDetailPanel, type NodeView } from "../../../src/features/nodes/NodeDetailPanel";
import {
  getNode, getNodeObservations, getNodeNeighbors, getObserver, getObserverActivity, getObserverAdverts, getObserverTelemetry,
} from "../../../src/api/client";
import type { Node } from "../../../src/features/nodes/types";
import type { Observer } from "../../../src/features/observers/types";

vi.mock("../../../src/api/client", () => ({
  getNode: vi.fn(), getNodeObservations: vi.fn(), getNodeNeighbors: vi.fn(), getServerInfo: vi.fn(() => new Promise(() => {})),
  getNodeTelemetry: vi.fn(), getNodePolling: vi.fn(),
  getObserver: vi.fn(), getObserverTelemetry: vi.fn(), getObserverActivity: vi.fn(), getObserverAdverts: vi.fn(),
  isNotFound: () => false,
}));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => <div data-testid="chart" /> }));

const node: Node = {
  id: "node-self", publicKey: "aabbccddeeff", nodeType: 2, nodeTypeName: "repeater", name: "Self Node", lat: null, lng: null,
  iatas: [], locationSource: null, lastAdvertAt: null, supportsMultibytePaths: false, supportsMultibyteTraces: false,
  minFirmwareVersion: null, firstSeen: 1, lastSeen: 2, metadata: null, observerId: "obs-1",
};
const observer = {
  id: "obs-1", displayName: "Roof Observer", iata: "YOW", status: "online", publicKey: "aabbccddeeff", brokers: [],
  firstSeen: 1, lastSeen: 2, observationCount: 10, batteryLevel: 4100, lastStatusAt: Date.now(),
} as unknown as Observer;

function mount(props: { view?: NodeView; onViewChange?: (v: NodeView) => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenObserverDashboard = vi.fn();
  const onViewObserver = vi.fn();
  const result = render(
    <QueryClientProvider client={client}>
      <NodeDetailPanel nodeId="node-self" onClose={vi.fn()} onViewObserver={onViewObserver} onOpenObserverDashboard={onOpenObserverDashboard} {...props} />
    </QueryClientProvider>,
  );
  return { ...result, onOpenObserverDashboard, onViewObserver };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getNode).mockResolvedValue(node);
  vi.mocked(getNodeObservations).mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  vi.mocked(getNodeNeighbors).mockResolvedValue([]);
  vi.mocked(getObserver).mockResolvedValue(observer);
  vi.mocked(getObserverTelemetry).mockResolvedValue({ range: "168h", interval: "6h", points: [{ t: 1_700_000_000_000, batteryMv: 4100, noiseFloorDb: -110 }] } as never);
  vi.mocked(getObserverActivity).mockResolvedValue(undefined as never);
  vi.mocked(getObserverAdverts).mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
});

const toggle = () => screen.getByRole("group", { name: "Node or observer view" });

describe("NodeDetailPanel Node | Observer switch", () => {
  it("is absent for a node that is not an observer", async () => {
    vi.mocked(getNode).mockResolvedValue({ ...node, observerId: undefined });
    mount();
    await screen.findByText("Self Node");
    expect(screen.queryByRole("group", { name: "Node or observer view" })).not.toBeInTheDocument();
  });

  it("starts on Node and fetches no observer data until the Observer view opens", async () => {
    const { onOpenObserverDashboard } = mount();
    await screen.findByText("Self Node");
    expect(screen.getByRole("button", { name: "Node", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(getObserver).not.toHaveBeenCalled();
    expect(getObserverTelemetry).not.toHaveBeenCalled();
    expect(getObserverAdverts).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Observer" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Roof Observer" })).toBeInTheDocument();
    expect(toggle()).toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    expect(getObserver).toHaveBeenCalledWith("obs-1");
    // battery and noise drawn; this observer reports no airtime
    await waitFor(() => expect(screen.getAllByTestId("chart")).toHaveLength(2));
    expect(screen.getByText("Airtime TX / RX")).toBeInTheDocument();
    expect(getObserverAdverts).toHaveBeenCalledWith("obs-1", { limit: 50 });
    expect(screen.getByText("Adverts heard")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open dashboard" }));
    expect(onOpenObserverDashboard).toHaveBeenCalledWith("obs-1");
  });

  it("shows no Telemetry section in the Node view of an observer", async () => {
    mount();
    await screen.findByText("Self Node");
    expect(screen.queryByText("Telemetry")).not.toBeInTheDocument();
  });

  it("is controlled when the host passes the view", async () => {
    const onViewChange = vi.fn();
    const { rerender } = mount({ view: "node", onViewChange });
    fireEvent.click(await screen.findByRole("button", { name: "Observer" }));
    expect(onViewChange).toHaveBeenCalledWith("observer");
    expect(screen.getByRole("button", { name: "Node", pressed: true })).toBeInTheDocument();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["node", "node-self"], node);
    rerender(
      <QueryClientProvider client={client}>
        <NodeDetailPanel nodeId="node-self" onClose={vi.fn()} onViewObserver={vi.fn()} view="observer" onViewChange={onViewChange} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { level: 2, name: "Roof Observer" })).toBeInTheDocument();
  });

  it("opens on the Observer view when asked, and falls back to Node for a node with no observer", async () => {
    vi.mocked(getNode).mockResolvedValue({ ...node, observerId: undefined });
    mount({ view: "observer" });
    await screen.findByText("Self Node");
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(getObserver).not.toHaveBeenCalled();
  });
});
