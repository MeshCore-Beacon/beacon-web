import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PacketExpansion } from "../../../src/features/packets/PacketExpansion";
import type { PacketSummary, Observation, PacketDetail } from "../../../src/types/api";
import { PayloadType, RouteType } from "../../../src/types/enums";

const usePacketDetail = vi.fn();
vi.mock("../../../src/features/packets/usePacketDetail", () => ({
  usePacketDetail: (h: string | null) => usePacketDetail(h),
}));

// Force the below-md media query so the expansion takes its mobile path.
function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: /hover/.test(query) ? !matches : matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const pkt = (over: Partial<PacketSummary> = {}): PacketSummary => ({
  packetHash: "AA11", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 1700000000, lastHeardAt: 1700000002, observationCount: 2, ...over,
});

const obs = (id: number, over: Partial<Observation> = {}): Observation => ({
  id, observerId: `o${id}`, observerName: `Observer ${id}`, iata: "YVR",
  heardAt: 1700000000 + id, pathLength: { raw: "41", hashSize: 1, hopCount: 1 },
  sourceBroker: "b1", resolvedPath: [], ...over,
});

const header = (payloadType = PayloadType.ADVERT) => ({
  raw: "12", routeType: RouteType.FLOOD, routeTypeName: "FLOOD",
  payloadType, payloadTypeName: "ADVERT", payloadVersion: 1,
});

const detail = (observations: Observation[], payloadType = PayloadType.ADVERT): PacketDetail =>
  ({ packetHash: "AA11", header: header(payloadType), observations } as unknown as PacketDetail);

const props = {
  packet: pkt(), onOpenAnalyzer: () => {}, onViewPath: () => {},
  selectedObservationId: null, onSelectObservation: () => {},
};

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

beforeEach(() => {
  usePacketDetail.mockReset();
  setMobile(true);
});
afterEach(() => vi.restoreAllMocks());

describe("PacketExpansion below md", () => {
  // The 8-column table is ~407px wide; inside the expansion on a 390px phone that pushes Path, the
  // last column, off-screen behind a nested horizontal scroll. Cards give it a full-width row.
  it("renders observation cards instead of the wide table", () => {
    usePacketDetail.mockReturnValue({ data: detail([obs(1), obs(2)]) });
    render(<PacketExpansion {...props} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("Observer 1")).toBeInTheDocument();
    expect(screen.getByText("Observer 2")).toBeInTheDocument();
  });

  it("shows each observation's resolved path outside of any table", () => {
    usePacketDetail.mockReturnValue({
      data: detail([obs(1, { pathBytes: "414243", pathLength: { raw: "414243", hashSize: 1, hopCount: 3 } })]),
    });
    render(<PacketExpansion {...props} />);

    for (const hop of ["41", "42", "43"]) {
      // a table cell would put it behind the nested horizontal scroll, which is the bug
      expect(screen.getByText(hop).closest("table")).toBeNull();
    }
  });

  it("opens the analyzer on the tapped observation card, selecting it first", () => {
    const onOpenAnalyzer = vi.fn();
    const onSelectObservation = vi.fn();
    usePacketDetail.mockReturnValue({ data: detail([obs(1), obs(2)]) });
    render(<PacketExpansion {...props} onOpenAnalyzer={onOpenAnalyzer} onSelectObservation={onSelectObservation} />);

    fireEvent.click(screen.getByText("Observer 2"));

    expect(onSelectObservation).toHaveBeenCalledWith(2);
    expect(onOpenAnalyzer).toHaveBeenCalledTimes(1);
  });

  // TRACE reuses the path field for per-hop SNR samples, so its bytes must never render as hops.
  it("labels a TRACE packet's path bytes as SNR samples", () => {
    usePacketDetail.mockReturnValue({
      data: detail([obs(1, { pathBytes: "3201e0", pathLength: { raw: "3201e0", hashSize: 1, hopCount: 3 } })], PayloadType.TRACE),
    });
    render(<PacketExpansion {...props} packet={pkt({ payloadType: PayloadType.TRACE })} />);

    expect(screen.getByText("Path SNR")).toBeInTheDocument();
    expect(screen.getByText("3201E0")).toBeInTheDocument();
  });

  // the expansion is the unfolded bottom half of the tapped card, not a separate square slab
  it("frames itself as a continuation of the packet card", () => {
    usePacketDetail.mockReturnValue({ data: detail([obs(1)]) });
    render(<PacketExpansion {...props} />);

    const cls = tokens(screen.getByTestId("packet-expansion"));
    expect(cls).toEqual(expect.arrayContaining(["border", "border-t-0", "rounded-b-md", "px-3.5"]));
  });

  // the card header directly above already names the latest observer, so the strip's copy is noise
  it("hides the observer line that duplicates the card header", () => {
    usePacketDetail.mockReturnValue({ isLoading: true });
    render(<PacketExpansion {...props} />);

    const observerLine = screen.getByText("n/a").parentElement!;
    expect(tokens(observerLine)).toEqual(expect.arrayContaining(["hidden", "md:inline"]));
  });

  it("sizes the summary strip and its action for touch", () => {
    usePacketDetail.mockReturnValue({ data: detail([obs(1)]) });
    render(<PacketExpansion {...props} />);

    const button = screen.getByRole("button", { name: "View path on map" });
    expect(tokens(button)).toEqual(
      expect.arrayContaining(["w-full", "md:w-auto", "py-2", "md:py-0.5", "text-[11px]", "md:text-[10px]"]),
    );
    expect(tokens(button.parentElement!)).toEqual(expect.arrayContaining(["text-[11px]", "md:text-[10px]"]));
  });

  it("gives the retry action the same touch sizing", () => {
    usePacketDetail.mockReturnValue({ isError: true, refetch: vi.fn() });
    render(<PacketExpansion {...props} />);

    expect(tokens(screen.getByRole("button", { name: /retry/i }))).toEqual(
      expect.arrayContaining(["py-2", "md:py-0.5"]),
    );
  });

  // a capped inner scroller inside the page scroller is a touch scroll trap; on mobile the
  // observation list flows in the page instead
  it("does not cap the observation list behind an inner scroller", () => {
    usePacketDetail.mockReturnValue({ data: detail([obs(1)]) });
    render(<PacketExpansion {...props} />);

    const cls = (screen.getByTestId("observation-scroller").getAttribute("class") ?? "").split(/\s+/);
    expect(cls).not.toContain("max-h-[360px]");
    expect(cls).not.toContain("overflow-y-auto");
  });

  it("still renders the table at md and above", () => {
    setMobile(false);
    usePacketDetail.mockReturnValue({ data: detail([obs(1)]) });
    render(<PacketExpansion {...props} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
