import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PacketExpansion } from "../../../src/features/packets/PacketExpansion";
import type { PacketSummary, Observation, PacketDetail } from "../../../src/types/api";
import { PayloadType, RouteType } from "../../../src/types/enums";

const usePacketDetail = vi.fn();
vi.mock("../../../src/features/packets/usePacketDetail", () => ({
  usePacketDetail: (h: string | null) => usePacketDetail(h),
}));

const pkt = (over: Partial<PacketSummary> = {}): PacketSummary => ({
  packetHash: "AA11", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 1700000000, lastHeardAt: 1700000002, observationCount: 3, ...over,
});

const obs = (id: number, over: Partial<Observation> = {}): Observation => ({
  id, observerId: `o${id}`, observerName: `Observer ${id}`, iata: "YVR",
  heardAt: 1700000000 + id, pathLength: { raw: "41", hashSize: 1, hopCount: 1 },
  sourceBroker: "b1", resolvedPath: [], ...over,
});

// minimal header so buildPacketPaths(data) (View path on map's hasPath check) doesn't crash on a
// partial detail fixture — any non-TRACE payload type does
const header = () => ({ raw: "12", routeType: RouteType.FLOOD, routeTypeName: "FLOOD", payloadType: PayloadType.ADVERT, payloadTypeName: "ADVERT", payloadVersion: 1 });

const resolvedHop = (id: string, lng: number, lat: number) => ({ confidence: "high" as const, nodes: [{ id, publicKey: "pk", longitude: lng, latitude: lat }] });

// a detail with a real drawable path (>=2 located hops), for the "hasPath" enabled cases
const detailWithPath = (): PacketDetail => ({
  packetHash: "AA11",
  header: header(),
  observations: [obs(1, { resolvedPath: [resolvedHop("a", -79, 43), resolvedHop("b", -75, 45)] })],
} as unknown as PacketDetail);

const props = {
  packet: pkt(), onOpenAnalyzer: () => {}, onViewPath: () => {},
  selectedObservationId: null, onSelectObservation: () => {},
};

beforeEach(() => usePacketDetail.mockReset());

describe("PacketExpansion", () => {
  it("shows one skeleton row per expected observation while loading", () => {
    usePacketDetail.mockReturnValue({ isLoading: true });
    render(<PacketExpansion {...props} />);
    expect(screen.getAllByTestId("observation-skeleton")).toHaveLength(3);
  });

  it("caps skeleton rows at the scroll cap for a large observation count", () => {
    usePacketDetail.mockReturnValue({ isLoading: true });
    render(<PacketExpansion {...props} packet={pkt({ observationCount: 50 })} />);
    expect(screen.getAllByTestId("observation-skeleton")).toHaveLength(12);
  });

  it("shows an error line with retry on failure", () => {
    usePacketDetail.mockReturnValue({ isError: true, refetch: vi.fn() });
    render(<PacketExpansion {...props} />);
    expect(screen.getByText("Failed to load observations")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows error state even when summary count is zero", () => {
    usePacketDetail.mockReturnValue({ isError: true, refetch: vi.fn() });
    render(<PacketExpansion {...props} packet={pkt({ observationCount: 0 })} />);
    expect(screen.getByText("Failed to load observations")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText("No observations")).not.toBeInTheDocument();
  });

  it("calls refetch when retry is clicked", () => {
    const refetch = vi.fn();
    usePacketDetail.mockReturnValue({ isError: true, refetch });
    render(<PacketExpansion {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows an empty state when the packet has no observations", () => {
    usePacketDetail.mockReturnValue({ data: { packetHash: "AA11", header: header(), observations: [] } });
    render(<PacketExpansion {...props} />);
    expect(screen.getByText("No observations")).toBeInTheDocument();
  });

  it("shows the empty state immediately when the summary count is zero, without a skeleton", () => {
    usePacketDetail.mockReturnValue({ isLoading: true });
    render(<PacketExpansion {...props} packet={pkt({ observationCount: 0 })} />);
    expect(screen.getByText("No observations")).toBeInTheDocument();
    expect(screen.queryByTestId("observation-skeleton")).not.toBeInTheDocument();
  });

  // guards against mobile card styling leaking up: at md+ the expansion stays the flat
  // left-accented strip under the grid row
  it("keeps the desktop strip framing at md and above", () => {
    usePacketDetail.mockReturnValue({ data: detailWithPath() });
    render(<PacketExpansion {...props} />);

    const cls = (screen.getByTestId("packet-expansion").getAttribute("class") ?? "").split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["md:border-0", "md:border-l-2", "md:rounded-none", "md:pl-6"]));
  });

  it("keeps the observation scroll cap at md and above", () => {
    usePacketDetail.mockReturnValue({ data: detailWithPath() });
    render(<PacketExpansion {...props} />);

    const cls = (screen.getByTestId("observation-scroller").getAttribute("class") ?? "").split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["md:max-h-[360px]", "md:overflow-y-auto"]));
  });

  it("renders the timing strip from the summary without waiting for the fetch", () => {
    usePacketDetail.mockReturnValue({ isLoading: true });
    render(<PacketExpansion {...props} />);
    expect(screen.getByText(/spread/i)).toBeInTheDocument();
  });

  it("formats the spread as first/last converted from milliseconds, not re-scaled", () => {
    usePacketDetail.mockReturnValue({ isLoading: true });
    render(<PacketExpansion {...props} packet={pkt({ firstHeardAt: 1000, lastHeardAt: 3500 })} />);
    expect(screen.getByText("spread 2.500s")).toBeInTheDocument();
  });

  it("renders the observation table once data resolves", () => {
    usePacketDetail.mockReturnValue({ data: { packetHash: "AA11", header: header(), observations: [obs(1), obs(2)] } });
    render(<PacketExpansion {...props} />);
    expect(screen.getByText("Observer 1")).toBeInTheDocument();
    expect(screen.getByText("Observer 2")).toBeInTheDocument();
  });

  it("wires selectedObservationId and onSelectObservation through to the observation table", () => {
    const onSelectObservation = vi.fn();
    usePacketDetail.mockReturnValue({ data: { packetHash: "AA11", header: header(), observations: [obs(1), obs(2)] } });
    render(<PacketExpansion {...props} selectedObservationId={2} onSelectObservation={onSelectObservation} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByText("Observer 1"));
    expect(onSelectObservation).toHaveBeenCalledWith(1);
  });

  // Clicking an observation opens the analyzer, so a dedicated button would be a second way to do
  // the same thing. Copy Link lives in the analyzer popup only.
  it("offers neither an Open analyzer nor a Copy link button", () => {
    usePacketDetail.mockReturnValue({ data: detailWithPath() });
    render(<PacketExpansion {...props} />);
    expect(screen.queryByRole("button", { name: "Open analyzer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy row link" })).not.toBeInTheDocument();
  });

  it("opens the analyzer on the clicked observation, selecting it first", () => {
    const onOpenAnalyzer = vi.fn();
    const onSelectObservation = vi.fn();
    usePacketDetail.mockReturnValue({ data: { packetHash: "AA11", header: header(), observations: [obs(1), obs(2)] } });
    render(<PacketExpansion {...props} onOpenAnalyzer={onOpenAnalyzer} onSelectObservation={onSelectObservation} />);

    fireEvent.click(screen.getByText("Observer 2"));

    expect(onSelectObservation).toHaveBeenCalledWith(2);
    expect(onOpenAnalyzer).toHaveBeenCalledTimes(1);
  });

  it("disables View path on map while loading", () => {
    usePacketDetail.mockReturnValue({ isLoading: true });
    render(<PacketExpansion {...props} />);
    expect(screen.getByRole("button", { name: "View path on map" })).toBeDisabled();
  });

  it("disables View path on map on error", () => {
    usePacketDetail.mockReturnValue({ isError: true, refetch: vi.fn() });
    render(<PacketExpansion {...props} />);
    expect(screen.getByRole("button", { name: "View path on map" })).toBeDisabled();
  });

  it("enables View path on map once the fetch resolves with a drawable path", () => {
    usePacketDetail.mockReturnValue({ data: detailWithPath() });
    render(<PacketExpansion {...props} />);
    expect(screen.getByRole("button", { name: "View path on map" })).not.toBeDisabled();
  });

  it("disables View path on map when the loaded detail has no resolvable path", () => {
    usePacketDetail.mockReturnValue({ data: { packetHash: "AA11", header: header(), observations: [obs(1)] } });
    render(<PacketExpansion {...props} />);
    const viewPathBtn = screen.getByRole("button", { name: "View path on map" });
    expect(viewPathBtn).toBeDisabled();
    expect(viewPathBtn).toHaveAttribute("title", "No resolved path to map");
  });

  it("calls onViewPath when its button is clicked", () => {
    const onViewPath = vi.fn();
    usePacketDetail.mockReturnValue({ data: detailWithPath() });
    render(<PacketExpansion {...props} onViewPath={onViewPath} />);
    fireEvent.click(screen.getByRole("button", { name: "View path on map" }));
    expect(onViewPath).toHaveBeenCalledTimes(1);
  });
});
