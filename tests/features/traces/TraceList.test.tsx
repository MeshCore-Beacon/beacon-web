import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TraceList } from "../../../src/features/traces/TraceList";
import { RegionProvider } from "../../../src/hooks/useRegion";
import { ALL_REGIONS, type RegionSelection } from "../../../src/hooks/region-selection";
import { getTraces, getTraceDetail, getRegions, getRegion } from "../../../src/api/client";
import { timeAgoMs } from "../../../src/lib/formatters";
import type { TraceTagSummary, TraceDetail } from "../../../src/types/api";
import i18n from "../../../src/i18n";

vi.mock("../../../src/api/client", () => ({
  getTraces: vi.fn(),
  getTraceDetail: vi.fn(),
  getRegions: vi.fn(),
  getRegion: vi.fn(),
}));

const mockGetTraces = vi.mocked(getTraces);
const mockGetTraceDetail = vi.mocked(getTraceDetail);
const mockGetRegions = vi.mocked(getRegions);

function tag(traceTag: string, packetCount = 1, extra: Partial<TraceTagSummary> = {}): TraceTagSummary {
  return { traceTag, firstHeardAt: 1, lastHeardAt: 2, packetCount, iataCount: 1, traceType: "TRACE", pathHashes: [], snrValues: [], ...extra };
}

const detail: TraceDetail = {
  traceTag: "3f2a11c0",
  packets: [
    { packetHash: "hash-aaa", routeType: 1, routeTypeName: "ROUTE_REQUEST", firstHeardAt: 1, lastHeardAt: 2, rawPath: [], resolvedRoute: [] },
    { packetHash: "hash-bbb", routeType: 1, routeTypeName: "ROUTE_REQUEST", firstHeardAt: 1, lastHeardAt: 2, rawPath: [], resolvedRoute: [] },
  ],
};

function renderTraces(onAnalyze = vi.fn(), selection: RegionSelection = ALL_REGIONS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <RegionProvider defaultSelection={selection}>{children}</RegionProvider>
    </QueryClientProvider>
  );
  const { container } = render(<TraceList onAnalyze={onAnalyze} />, { wrapper });
  return { onAnalyze, container };
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

  it("keeps TRACE and PING cards from shrinking in the scrollable list", async () => {
    mockGetTraces.mockResolvedValue([
      tag("3f2a11c0", 2, { traceType: "TRACE", pathHashes: ["a1", "b2"], snrValues: [-7.5, 0] }),
      tag("9b40de22", 1, { traceType: "PING", pathHashes: ["c3"], snrValues: [] }),
    ]);

    renderTraces();

    // jsdom cannot measure layout; guard the CSS contract on each row root.
    for (const traceTag of ["3F2A11C0", "9B40DE22"]) {
      const card = (await screen.findByText(traceTag)).closest('[role="button"]');
      expect(card).toHaveClass("shrink-0");
    }
  });

  it("contains a 145-hop preview and expands/collapses it with the report", async () => {
    const hashes = Array.from({ length: 145 }, (_, i) => i.toString(16).padStart(8, "0"));
    mockGetTraces.mockResolvedValue([
      tag("3f2a11c0", 2, { pathHashes: hashes, snrValues: [0, -7.5] }),
    ]);
    mockGetTraceDetail.mockResolvedValue(detail);

    const { container, onAnalyze } = renderTraces();
    const card = await screen.findByRole("button", { name: /3F2A11C0/ });
    const preview = within(card).getByText("00000000").closest("div");

    // jsdom checks the width/wrapping contract, not rendered pixel geometry.
    expect(container.firstElementChild).toHaveClass("min-w-0", "max-w-full");
    expect(card).toHaveClass("shrink-0", "min-w-0", "max-w-full");
    expect(preview).toHaveClass("min-w-0", "max-w-full", "flex-wrap");
    expect(preview).not.toHaveClass("whitespace-nowrap");
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(within(card).getByText(/145 hops/)).toBeInTheDocument();
    expect(within(card).getByText("00000005")).toBeInTheDocument();
    expect(within(card).queryByText("00000006")).not.toBeInTheDocument();
    expect(within(card).getByText("… +139")).toBeInTheDocument();
    expect(within(card).getByText("0.00 dB")).toBeInTheDocument();
    expect(mockGetTraceDetail).not.toHaveBeenCalled();

    fireEvent.click(within(card).getByText("▸"));
    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(within(card).getByText(hashes[144].toUpperCase())).toBeInTheDocument();
    expect(within(card).queryByText("… +139")).not.toBeInTheDocument();
    expect(await screen.findByText("Packets")).toBeInTheDocument();
    expect(mockGetTraceDetail).toHaveBeenCalledWith("3f2a11c0");
    expect(onAnalyze).not.toHaveBeenCalled();

    fireEvent.click(within(card).getByText("▾"));
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(within(card).queryByText(hashes[144].toUpperCase())).not.toBeInTheDocument();
    expect(within(card).getByText("… +139")).toBeInTheDocument();
    expect(screen.queryByText("Packets")).not.toBeInTheDocument();

    fireEvent.keyDown(card, { key: "Enter" });
    expect(card).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Packets")).toBeInTheDocument();
    fireEvent.keyDown(card, { key: " " });
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Packets")).not.toBeInTheDocument();
  });

  it("expands only the selected row and collapses it when its report closes", async () => {
    mockGetTraces.mockResolvedValue([
      tag("3f2a11c0"),
      tag("9b40de22", 1, { traceType: "PING", pathHashes: ["a1"], snrValues: [] }),
    ]);
    mockGetTraceDetail.mockImplementation(async (traceTag) => ({ ...detail, traceTag }));

    renderTraces();
    const first = await screen.findByRole("button", { name: /3F2A11C0/ });
    const second = screen.getByRole("button", { name: /9B40DE22/ });
    fireEvent.click(first);
    expect(await screen.findByText("Packets")).toBeInTheDocument();
    expect(first).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(mockGetTraceDetail).toHaveBeenCalledWith("9b40de22"));
    fireEvent.click(screen.getByRole("button", { name: "Close detail panel" }));
    expect(second).toHaveAttribute("aria-expanded", "false");
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
        { packetHash: "hash-aaa", routeType: 1, routeTypeName: "ROUTE_REQUEST", firstHeardAt: 1717689045001, lastHeardAt: 1717689045123, rawPath: [], resolvedRoute: [] },
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

  it("renders each hop's raw path-hash byte and surfaces resolved nodes in the popover", async () => {
    mockGetTraces.mockResolvedValue([tag("3f2a11c0", 1)]);
    mockGetTraceDetail.mockResolvedValue({
      traceTag: "3f2a11c0",
      packets: [
        {
          packetHash: "hash-aaa",
          routeType: 1,
          routeTypeName: "ROUTE_REQUEST",
          firstHeardAt: 1,
          lastHeardAt: 2,
          rawPath: [{ hash: "a1", snr: -7.5 }, { hash: "b2" }],
          resolvedRoute: [
            { confidence: "high", nodes: [{ id: "n1", name: "GatewayX", publicKey: "deadbeef" }] },
            { confidence: "none", nodes: [] },
          ],
        },
      ],
    });

    renderTraces();
    fireEvent.click(await screen.findByText("3F2A11C0"));

    // raw bytes shown uppercase, like the packet path renderer
    const hopA = await screen.findByText("A1");
    expect(hopA).toBeInTheDocument();
    expect(screen.getByText("B2")).toBeInTheDocument();

    // per-hop SNR sits on a sub-line below the hash, like the TRACE payload view
    expect(screen.getByText("-7.50 dB")).toBeInTheDocument();

    // hovering a resolved hop reveals its candidate node
    fireEvent.mouseEnter(hopA);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("GatewayX");
  });

  it("tags each card as TRACE or PING and previews the most complete path with per-hop SNR", async () => {
    mockGetTraces.mockResolvedValue([
      tag("3f2a11c0", 4, { traceType: "PING", pathHashes: ["a1", "b2"], snrValues: [-7.5, -9] }),
    ]);

    renderTraces();

    expect(await screen.findByText("3F2A11C0")).toBeInTheDocument();
    expect(screen.getByText("PING")).toBeInTheDocument();
    // the path preview shows each hop's hash byte (uppercased) with its SNR on the sub-line
    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("B2")).toBeInTheDocument();
    expect(screen.getByText("-7.50 dB")).toBeInTheDocument();
  });

  it("refetches with the type param when the trace-type filter changes", async () => {
    mockGetTraces.mockResolvedValue([tag("3f2a11c0", 1)]);

    renderTraces();
    await screen.findByText("3F2A11C0");

    fireEvent.click(screen.getByRole("button", { name: "Ping" }));

    // the region arg is undefined for "all regions", so assert on the params object directly
    await waitFor(() => expect(mockGetTraces.mock.calls.at(-1)?.[1]).toMatchObject({ type: "PING" }));
  });

  it("explains that the type filter classifies whole tags", async () => {
    mockGetTraces.mockResolvedValue([]);

    renderTraces();

    expect(await screen.findByText(/TRACE if any packet in the tag is multi-hop/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no traces", async () => {
    mockGetTraces.mockResolvedValue([]);

    renderTraces();

    expect(await screen.findByText("No traces")).toBeInTheDocument();
  });

  it("translates the list and the detail panel", async () => {
    await i18n.changeLanguage("fr");
    mockGetTraces.mockResolvedValue([tag("3f2a11c0", 2)]);
    mockGetTraceDetail.mockResolvedValue(detail);
    renderTraces();
    expect(await screen.findByText("1 étiquette")).toBeInTheDocument();
    expect(screen.getByText("2 paq. · 1 iata · 0 sauts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tous" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("3F2A11C0"));
    expect(await screen.findByText("Paquets")).toBeInTheDocument();
    expect(await screen.findByText("2 paquets")).toBeInTheDocument();
    expect(screen.getAllByText("analyser →")).toHaveLength(2);
  });
});

it("waits for a named region to load before asking for its traces", async () => {
  let loadRegions!: (value: { id: number; slug: string; name: string }[]) => void;
  mockGetRegions.mockReturnValue(new Promise((done) => { loadRegions = done; }));
  vi.mocked(getRegion).mockResolvedValue({ id: 1, slug: "onqc", name: "Ottawa", iatas: ["YOW"] });
  mockGetTraces.mockResolvedValue([]);

  renderTraces(vi.fn(), { regions: ["onqc"], iatas: [] });

  await new Promise((done) => setTimeout(done, 50));
  expect(mockGetTraces).not.toHaveBeenCalled();
  expect(screen.queryByText("No traces")).not.toBeInTheDocument();

  loadRegions([{ id: 1, slug: "onqc", name: "Ottawa" }]);
  await waitFor(() => expect(mockGetTraces).toHaveBeenCalledWith(["YOW"], expect.anything()));
});

it("stops waiting once the region list loads without the selected region", async () => {
  mockGetRegions.mockResolvedValue([]);
  mockGetTraces.mockResolvedValue([]);

  renderTraces(vi.fn(), { regions: ["deleted-region"], iatas: [] });

  await waitFor(() => expect(mockGetTraces).toHaveBeenCalled());
});

it("hides suspect and ambiguous tags by default, with an explicit evidence toggle", async () => {
 mockGetTraces.mockResolvedValue([
  tag("11111111",1,{traceType:"PING", quality:{status:"supported",reasons:[]}}),
  tag("a0595008",2,{quality:{status:"suspect",reasons:["unsupported_version","too_many_hops"]}}),
  tag("33333333",1,{quality:{status:"ambiguous",reasons:["ambiguous_prefix"]}}),
 ]);
 renderTraces();
 expect(await screen.findByText("11111111")).toBeInTheDocument();
 expect(screen.queryByText("A0595008")).not.toBeInTheDocument();
 expect(screen.queryByText("33333333")).not.toBeInTheDocument();
 expect(screen.getByText(/2 hidden in loaded sample/)).toBeInTheDocument();
 const toggle=screen.getByRole("checkbox",{name:"Show possible collision related observations"});
 fireEvent.click(toggle);
 expect(screen.getByText("A0595008")).toBeInTheDocument();
 expect(screen.getByText("Suspect observation")).toHaveAttribute("class");
 expect(screen.getByText("Possible prefix collision")).toBeInTheDocument();
 fireEvent.click(toggle);
 expect(screen.queryByText("A0595008")).not.toBeInTheDocument();
});
