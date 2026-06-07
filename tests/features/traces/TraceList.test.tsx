import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TraceList } from "../../../src/features/traces/TraceList";
import { RegionProvider } from "../../../src/hooks/useRegion";
import { ALL_REGIONS } from "../../../src/hooks/region-selection";
import { getTraces, getTraceDetail, getRegions } from "../../../src/api/client";
import { timeAgoMs } from "../../../src/lib/formatters";
import type { TraceTagSummary, TraceDetail } from "../../../src/types/api";

vi.mock("../../../src/api/client", () => ({
  getTraces: vi.fn(),
  getTraceDetail: vi.fn(),
  getRegions: vi.fn(),
}));

const mockGetTraces = vi.mocked(getTraces);
const mockGetTraceDetail = vi.mocked(getTraceDetail);
const mockGetRegions = vi.mocked(getRegions);

function tag(traceTag: string, packetCount = 1): TraceTagSummary {
  return { traceTag, firstHeardAt: 1, lastHeardAt: 2, packetCount, iataCount: 1 };
}

const detail: TraceDetail = {
  traceTag: "3f2a11c0",
  packets: [
    { packetHash: "hash-aaa", routeType: 1, routeTypeName: "ROUTE_REQUEST", firstHeardAt: 1, lastHeardAt: 2, resolvedRoute: [] },
    { packetHash: "hash-bbb", routeType: 1, routeTypeName: "ROUTE_REQUEST", firstHeardAt: 1, lastHeardAt: 2, resolvedRoute: [] },
  ],
};

function renderTraces(onAnalyze = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RegionProvider defaultSelection={ALL_REGIONS}>{children}</RegionProvider>
    </QueryClientProvider>
  );
  render(<TraceList onAnalyze={onAnalyze} />, { wrapper });
  return { onAnalyze };
}

beforeEach(() => {
  mockGetTraces.mockReset();
  mockGetTraceDetail.mockReset();
  mockGetRegions.mockReset();
  mockGetRegions.mockResolvedValue([]);
});

describe("TraceList", () => {
  it("renders a card per trace tag and no detail panel until one is clicked", async () => {
    mockGetTraces.mockResolvedValue([tag("3f2a11c0", 12), tag("9b40de22", 5)]);

    renderTraces();

    expect(await screen.findByText("3F2A11C0")).toBeInTheDocument();
    expect(screen.getByText("9B40DE22")).toBeInTheDocument();
    // no detail panel yet -> no "Packets" section heading
    expect(screen.queryByText("Packets")).not.toBeInTheDocument();
  });

  it("opens the detail panel with a Packets section listing the trace's packets when a card is clicked", async () => {
    mockGetTraces.mockResolvedValue([tag("3f2a11c0", 2)]);
    mockGetTraceDetail.mockResolvedValue(detail);

    renderTraces();

    fireEvent.click(await screen.findByText("3F2A11C0"));

    expect(await screen.findByText("Packets")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("ROUTE_REQUEST")).toHaveLength(2));
    expect(mockGetTraceDetail).toHaveBeenCalledWith("3f2a11c0");
  });

  it("shows each packet's first/last heard with millisecond precision", async () => {
    mockGetTraces.mockResolvedValue([tag("3f2a11c0", 1)]);
    mockGetTraceDetail.mockResolvedValue({
      traceTag: "3f2a11c0",
      packets: [
        { packetHash: "hash-aaa", routeType: 1, routeTypeName: "ROUTE_REQUEST", firstHeardAt: 1717689045001, lastHeardAt: 1717689045123, resolvedRoute: [] },
      ],
    });

    renderTraces();
    fireEvent.click(await screen.findByText("3F2A11C0"));

    expect(await screen.findByText("First")).toBeInTheDocument();
    expect(screen.getByText("Last")).toBeInTheDocument();
    // First/Last show a relative label (same here, 122ms apart); the exact ms is in the hover tooltip
    const labels = screen.getAllByText(`${timeAgoMs(1717689045001)} ago`);
    expect(labels).toHaveLength(2);
    fireEvent.mouseEnter(labels[0]);
    expect(screen.getByRole("tooltip").textContent).toMatch(/\.001$/); // First, ms preserved
    fireEvent.mouseLeave(labels[0]);
    fireEvent.mouseEnter(labels[1]);
    expect(screen.getByRole("tooltip").textContent).toMatch(/\.123$/); // Last, ms preserved
  });

  it("calls onAnalyze with the packet hash when a packet row is clicked", async () => {
    mockGetTraces.mockResolvedValue([tag("3f2a11c0", 2)]);
    mockGetTraceDetail.mockResolvedValue(detail);

    const { onAnalyze } = renderTraces();

    fireEvent.click(await screen.findByText("3F2A11C0"));
    const rows = await screen.findAllByText("ROUTE_REQUEST");
    fireEvent.click(rows[0]);

    expect(onAnalyze).toHaveBeenCalledWith("hash-aaa");
  });

  it("shows an empty state when there are no traces", async () => {
    mockGetTraces.mockResolvedValue([]);

    renderTraces();

    expect(await screen.findByText("No traces")).toBeInTheDocument();
  });
});
