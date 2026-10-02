import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TraceDetailPanel } from "../../../src/features/traces/TraceDetailPanel";
import { getTraceDetail } from "../../../src/api/client";
import type { TracePacket } from "../../../src/types/api";

vi.mock("../../../src/api/client", () => ({ getTraceDetail: vi.fn() }));

const pkt = (over: Partial<TracePacket>): TracePacket => ({
  packetHash: "aa11", routeType: 1, routeTypeName: "FLOOD", firstHeardAt: 1, lastHeardAt: 2,
  rawPath: [], resolvedRoute: [], ...over,
});

function renderPanel(packets: TracePacket[]) {
  vi.mocked(getTraceDetail).mockResolvedValue({ traceTag: "deadbeef", packets });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TraceDetailPanel tag="deadbeef" onClose={() => {}} onAnalyze={() => {}} />
    </QueryClientProvider>,
  );
}

// the server sends null for both when the payload didn't parse or the packet has no IATAs
describe("TraceDetailPanel", () => {
  it("renders hops when resolvedRoute is null", async () => {
    renderPanel([pkt({ rawPath: [{ hash: "ab", snr: 4 }], resolvedRoute: null })]);
    expect(await screen.findByText("AB")).toBeInTheDocument();
  });

  it("shows the no-path note when rawPath is null", async () => {
    renderPanel([pkt({ rawPath: null, resolvedRoute: null })]);
    expect(await screen.findByText("no path")).toBeInTheDocument();
  });
});
