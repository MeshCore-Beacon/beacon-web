import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NodeTelemetrySection from "../../../src/features/nodes/NodeTelemetrySection";
import { getNodePolling, getNodeTelemetry } from "../../../src/api/client";
import type { Node, NodePolling, NodeTelemetry } from "../../../src/features/nodes/types";

vi.mock("../../../src/api/client", () => ({
  getNodeTelemetry: vi.fn(),
  getNodePolling: vi.fn(),
  isNotFound: () => false,
}));
// ECharts needs a real canvas; the section's behaviour is in which cards it draws
vi.mock("../../../src/features/stats/EChart", () => ({
  EChart: ({ option }: { option: unknown }) => <div data-testid="chart" data-option={JSON.stringify(option)} />,
}));

const mockTelemetry = vi.mocked(getNodeTelemetry);
const mockPolling = vi.mocked(getNodePolling);

const node = { id: "n1", nodeTypeName: "repeater" } as Node;
const point = { t: 1_700_000_000_000, readings: 2, batteryMv: 4200, temperatureC: 16, noiseFloorDb: -97, airtimeTxSecs: 1, airtimeRxSecs: 2 };
const tele = (points: NodeTelemetry["points"], polled = true): NodeTelemetry => ({ range: "168h", interval: "6h", polled, untrustedReadings: 0, points });
const polling = (over: Partial<NodePolling> = {}): NodePolling => ({
  polled: true, latestReadingAt: 1_700_000_000_000, poller: { observerId: "obs-1", name: "HOWL V4.2" }, standbys: [], ...over,
});

function renderSection(onViewObserver = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}><NodeTelemetrySection node={node} onViewObserver={onViewObserver} /></QueryClientProvider>,
  );
  return { ...result, onViewObserver };
}

beforeEach(() => {
  mockTelemetry.mockReset();
  mockPolling.mockReset();
});

describe("NodeTelemetrySection", () => {
  it("renders nothing without telemetry and without a poller", async () => {
    mockTelemetry.mockResolvedValue(tele([], false));
    mockPolling.mockResolvedValue(polling({ polled: false, poller: null, latestReadingAt: null }));
    const { container } = renderSection();
    await waitFor(() => expect(mockPolling).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one waiting line when a poller is assigned but nothing has arrived", async () => {
    mockTelemetry.mockResolvedValue(tele([], false));
    mockPolling.mockResolvedValue(polling({ polled: false, latestReadingAt: null }));
    renderSection();
    expect(await screen.findByText(/HOWL V4\.2.*waiting for the first reading/)).toBeInTheDocument();
    expect(screen.queryAllByTestId("chart")).toHaveLength(0);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("draws four charts with full data, defaulting to 7d", async () => {
    mockTelemetry.mockResolvedValue(tele([point]));
    mockPolling.mockResolvedValue(polling({ standbys: [{ observerId: "o2", name: "B", rank: 1 }] }));
    renderSection();
    expect(await screen.findAllByTestId("chart")).toHaveLength(4);
    expect(mockTelemetry.mock.calls[0]?.[1]).toBe("168h");
    expect(screen.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 standby")).toBeInTheDocument();
  });

  it("draws only the charts whose field is present", async () => {
    mockTelemetry.mockResolvedValue(tele([{ t: point.t, readings: 1, batteryMv: 4200, temperatureC: 16 }]));
    mockPolling.mockResolvedValue(polling());
    renderSection();
    expect(await screen.findAllByTestId("chart")).toHaveLength(2);
  });

  it("links the poller to its observer", async () => {
    mockTelemetry.mockResolvedValue(tele([point]));
    mockPolling.mockResolvedValue(polling());
    const { onViewObserver } = renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "HOWL V4.2" }));
    expect(onViewObserver).toHaveBeenCalledWith("obs-1");
  });

  it("refetches with the chosen range and keeps the control while it loads", async () => {
    mockTelemetry.mockResolvedValue(tele([point]));
    mockPolling.mockResolvedValue(polling());
    renderSection();
    await screen.findAllByTestId("chart");
    mockTelemetry.mockResolvedValue({ ...tele([point]), range: "24h" });
    fireEvent.click(screen.getByRole("button", { name: "24h" }));
    await waitFor(() => expect(mockTelemetry.mock.calls.map((c) => c[1])).toContain("24h"));
    expect(screen.getByRole("button", { name: "24h" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "30d" }));
    await waitFor(() => expect(mockTelemetry.mock.calls.map((c) => c[1])).toContain("720h"));
  });
});
