import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NodeDetailPanel } from "../../../src/features/nodes/NodeDetailPanel";
import { getNode, getNodeObservations, getNodeNeighbors, getNodeTelemetry, getNodePolling } from "../../../src/api/client";
import { requests } from "../../../src/api/auth";
import { user } from "../account/helpers";
import type { Node } from "../../../src/features/nodes/types";

vi.mock("../../../src/api/client", () => ({
  getNode: vi.fn(), getNodeObservations: vi.fn(), getNodeNeighbors: vi.fn(),
  getServerInfo: vi.fn(), getNodeTelemetry: vi.fn(), getNodePolling: vi.fn(), isNotFound: () => false,
}));
vi.mock("../../../src/api/auth", () => ({ requests: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() } }));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => <div data-testid="chart" /> }));

const state = { polling: false, telemetryRequests: true, user: user as typeof user | null };
vi.mock("../../../src/hooks/useFeatures", () => ({
  useFeatures: () => ({ polling: state.polling, accounts: "local", registration: true, telemetryRequests: state.telemetryRequests, alerts: false }),
  useDisplayUnits: () => ({ temperature: "c", distance: "metric" }),
}));
vi.mock("../../../src/hooks/useSession", () => ({
  useSession: () => ({ user: state.user, loading: false, enabled: true, refresh: () => {} }),
}));

const node: Node = {
  id: "node-self", publicKey: "aabbccddeeff", nodeType: 2, nodeTypeName: "repeater", name: "Self Node", lat: null, lng: null,
  iatas: [], locationSource: null, lastAdvertAt: null, supportsMultibytePaths: false, supportsMultibyteTraces: false,
  minFirmwareVersion: null, firstSeen: 1, lastSeen: 2, metadata: null,
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NodeDetailPanel nodeId="node-self" onClose={vi.fn()} onViewObserver={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { polling: false, telemetryRequests: true, user });
  vi.mocked(getNode).mockResolvedValue(node);
  vi.mocked(getNodeObservations).mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  vi.mocked(getNodeNeighbors).mockResolvedValue([]);
  vi.mocked(getNodeTelemetry).mockResolvedValue({ range: "168h", interval: "6h", polled: false, untrustedReadings: 0, points: [] });
  vi.mocked(getNodePolling).mockResolvedValue({ polled: false, latestReadingAt: null, poller: null, standbys: [] } as never);
  vi.mocked(requests.list).mockResolvedValue({ limit: 3, requests: [] });
});

describe("NodeDetailPanel request block", () => {
  it("stands alone under a Telemetry heading when polling is off and the repeater was never polled", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Request telemetry" })).toBeInTheDocument();
    expect(screen.getByText("Telemetry")).toBeInTheDocument();
  });

  it("appears inside the Telemetry area when polling is on but nothing was ever polled", async () => {
    state.polling = true;
    mount();
    expect(await screen.findByRole("button", { name: "Request telemetry" })).toBeInTheDocument();
    expect(screen.getAllByText("Telemetry")).toHaveLength(1);
  });

  it("shows for a room server", async () => {
    vi.mocked(getNode).mockResolvedValue({ ...node, nodeTypeName: "room_server" });
    mount();
    expect(await screen.findByRole("button", { name: "Request telemetry" })).toBeInTheDocument();
  });

  it.each([
    ["a companion", () => vi.mocked(getNode).mockResolvedValue({ ...node, nodeTypeName: "companion" })],
    ["a signed out visitor", () => { state.user = null; }],
    ["the feature off", () => { state.telemetryRequests = false; }],
  ])("is absent for %s and fetches nothing", async (_n, arrange) => {
    arrange();
    mount();
    await screen.findByText("Self Node");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("button", { name: "Request telemetry" })).not.toBeInTheDocument();
    expect(requests.list).not.toHaveBeenCalled();
  });
});
