import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PacketList } from "../../../src/features/packets/PacketList";
import type { WsManager } from "../../../src/api/ws-manager";
import type { PacketSummary, PacketDetail } from "../../../src/types/api";
import type { WsPacketObservation } from "../../../src/types/ws";

const basePackets = () => ({
  allPackets: [] as PacketSummary[],
  observerOptions: [],
  newPacketCount: 0,
  acknowledgeNewPackets: () => {},
  fetchNextPage: () => {},
  hasNextPage: false,
  isFetchingNextPage: false,
  isLoading: false,
  isError: false,
  observersByHash: new Map(),
  handlePacketObservation: () => {},
  handleLagged: () => {},
  laggedCount: 0,
  dismissLagged: () => {},
});
const usePackets = vi.fn(basePackets);
vi.mock("../../../src/features/packets/usePackets", () => ({
  usePackets: (...args: unknown[]) => usePackets(...(args as [])),
}));

const baseDetail = () => ({ data: undefined as PacketDetail | undefined, isLoading: false, isError: false, error: null as Error | null, refetch: vi.fn() });
const usePacketDetail = vi.fn(baseDetail);
vi.mock("../../../src/features/packets/usePacketDetail", () => ({
  usePacketDetail: (hash: string | null) => usePacketDetail(hash as never),
}));

vi.mock("../../../src/hooks/useScopes", () => ({ useScopes: () => [] }));

vi.mock("../../../src/hooks/useRegion", () => ({
  useRegion: () => ({ iatas: ["YOW"], regionKey: "YOW" }),
}));

// capture the packet handler so tests can push a live observation through it
let packetHandler: ((data: WsPacketObservation["data"]) => void) | null = null;
vi.mock("../../../src/hooks/useWsHandlers", () => ({
  useWsPacketHandler: (_manager: unknown, handler: (data: WsPacketObservation["data"]) => void) => {
    packetHandler = handler;
  },
  useWsLaggedHandler: () => {},
}));

// the virtual list needs ResizeObserver in jsdom; stub it down to the wiring under test
vi.mock("../../../src/features/packets/PacketVirtualList", () => ({
  PacketVirtualList: ({
    packets,
    expandedHash,
    onToggleExpand,
    onOpenAnalyzer,
    onViewPath,
  }: {
    packets: PacketSummary[];
    expandedHash: string | null;
    onToggleExpand: (hash: string) => void;
    onOpenAnalyzer: () => void;
    onViewPath: () => void;
  }) => (
    <div>
      <div data-testid="expanded">{String(expandedHash)}</div>
      <button type="button" onClick={onOpenAnalyzer}>Open analyzer</button>
      <button type="button" onClick={onViewPath}>View path on map</button>
      {packets.map((p) => (
        <button
          key={p.packetHash}
          type="button"
          aria-expanded={expandedHash === p.packetHash}
          onClick={() => onToggleExpand(p.packetHash)}
        >
          {p.packetHash}
        </button>
      ))}
    </div>
  ),
}));

const packet = (hash: string): PacketSummary => ({
  packetHash: hash, payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 1700000000, lastHeardAt: 1700000000, observationCount: 1,
});

const observation = (hash: string): WsPacketObservation["data"] => ({
  packetHash: hash,
  packet: {
    payloadType: 1, payloadTypeName: "ADVERT",
    routeType: 1, routeTypeName: "FLOOD",
    isFirstObservation: false, observationCount: 2,
  },
  observation: {
    observerId: "o1", observerName: "Observer 1", iata: "YOW",
    heardAt: 1700000001, rssi: -90, snr: 5, sourceBroker: "b1",
  },
});

function renderList(url = "/", props: Partial<Parameters<typeof PacketList>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const onAnalyze = props.onAnalyze ?? vi.fn();
  const onViewPath = props.onViewPath ?? vi.fn();
  const onSelectObservation = props.onSelectObservation ?? vi.fn();

  render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={queryClient}>
        <PacketList
          wsManager={{} as unknown as WsManager}
          onAnalyze={onAnalyze}
          onViewPath={onViewPath}
          selectedObservationId={null}
          onSelectObservation={onSelectObservation}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  return { onAnalyze, onViewPath, onSelectObservation, invalidate };
}

describe("PacketList server filter wiring", () => {
  it("passes a single selected type to usePackets as the server filter", () => {
    usePackets.mockClear();
    renderList("/?types=4");
    expect(usePackets).toHaveBeenLastCalledWith(false, { payloadTypes: [4] });
  });

  it("passes a multi-select filter server-side so history stays filtered", () => {
    usePackets.mockClear();
    renderList("/?types=2,4");
    expect(usePackets).toHaveBeenLastCalledWith(false, { payloadTypes: [2, 4] });
  });
});

describe("PacketList loading feedback", () => {
  afterEach(() => {
    usePackets.mockImplementation(basePackets);
  });

  it("shows skeletons instead of the list plus a loading pill during an empty initial load", () => {
    usePackets.mockImplementation(() => ({ ...basePackets(), isLoading: true }));
    renderList();

    expect(screen.queryByTestId("expanded")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading packets…");
  });

  it("keeps the list and shows the pill while paging in more history", () => {
    const pkt = { packetHash: "h1", payloadType: 4, routeType: 1, firstHeardAt: 1, lastHeardAt: 1, observationCount: 1 } as PacketSummary;
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [pkt], isFetchingNextPage: true }));
    renderList();

    expect(screen.getByTestId("expanded")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Loading packets… (1)");
  });

  it("surfaces a failed history fetch through the pill", () => {
    usePackets.mockImplementation(() => ({ ...basePackets(), isError: true }));
    renderList();

    expect(screen.getByRole("status").textContent).toContain("Failed to load packets");
  });

  it("renders neither pill nor skeletons when idle", () => {
    renderList();

    expect(screen.getByTestId("expanded")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("PacketList expanded row", () => {
  afterEach(() => {
    usePackets.mockImplementation(basePackets);
    usePacketDetail.mockReturnValue(baseDetail());
  });

  it("expands a row from ?hash without opening the analyzer", () => {
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [packet("AA11")] }));

    const { onAnalyze } = renderList("/?tab=Packets&hash=AA11");

    expect(screen.getByRole("button", { name: /AA11/ })).toHaveAttribute("aria-expanded", "true");
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it("clicking a row sets ?hash and does not open the analyzer", () => {
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [packet("AA11")] }));

    const { onAnalyze } = renderList("/?tab=Packets");

    fireEvent.click(screen.getByRole("button", { name: /AA11/ }));
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it("routes the expansion's Open analyzer through onAnalyze with the expanded hash", () => {
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [packet("AA11")] }));

    const { onAnalyze } = renderList("/?tab=Packets&hash=AA11");

    fireEvent.click(screen.getByRole("button", { name: "Open analyzer" }));
    expect(onAnalyze).toHaveBeenCalledWith("AA11");
  });

  it("hands the loaded detail to onViewPath", () => {
    const detail = { packetHash: "AA11", observations: [] } as unknown as PacketDetail;
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [packet("AA11")] }));
    usePacketDetail.mockReturnValue({ ...baseDetail(), data: detail });

    const { onViewPath } = renderList("/?tab=Packets&hash=AA11");

    fireEvent.click(screen.getByRole("button", { name: "View path on map" }));
    expect(onViewPath).toHaveBeenCalledWith(detail);
  });

  it("does not call onViewPath before the detail has loaded", () => {
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [packet("AA11")] }));

    const { onViewPath } = renderList("/?tab=Packets&hash=AA11");

    fireEvent.click(screen.getByRole("button", { name: "View path on map" }));
    expect(onViewPath).not.toHaveBeenCalled();
  });
});

describe("PacketList live observation invalidation", () => {
  afterEach(() => {
    usePackets.mockImplementation(basePackets);
    packetHandler = null;
  });

  it("refetches the expanded row's detail when an observation arrives for it", () => {
    const handlePacketObservation = vi.fn();
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [packet("AA11")], handlePacketObservation }));

    const { invalidate } = renderList("/?tab=Packets&hash=AA11");
    invalidate.mockClear();
    packetHandler!(observation("AA11"));

    expect(handlePacketObservation).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["packet-detail", "AA11"] });
  });

  it("leaves the detail query alone for observations on other packets", () => {
    const handlePacketObservation = vi.fn();
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [packet("AA11")], handlePacketObservation }));

    const { invalidate } = renderList("/?tab=Packets&hash=AA11");
    invalidate.mockClear();
    packetHandler!(observation("BB22"));

    expect(handlePacketObservation).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not invalidate when no row is expanded", () => {
    const handlePacketObservation = vi.fn();
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [packet("AA11")], handlePacketObservation }));

    const { invalidate } = renderList("/?tab=Packets");
    invalidate.mockClear();
    packetHandler!(observation("AA11"));

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("PacketList selected packet outside the loaded results", () => {
  afterEach(() => {
    usePackets.mockImplementation(basePackets);
    usePacketDetail.mockReturnValue(baseDetail());
  });

  it("offers the existing analyzer without scanning history for an unloaded packet", () => {
    const fetchNextPage = vi.fn();
    usePackets.mockImplementation(() => ({ ...basePackets(), hasNextPage: true, fetchNextPage }));
    usePacketDetail.mockReturnValue({ ...baseDetail(), data: { packetHash: "AA11" } as PacketDetail });
    const { onAnalyze } = renderList("/?hash=AA11");
    const notice = screen.getByRole("region", { name: "Selected packet" });
    expect(notice).toHaveTextContent("outside the loaded results");
    fireEvent.click(within(notice).getByRole("button", { name: "Open analyzer" }));
    expect(onAnalyze).toHaveBeenCalledWith("AA11");
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("offers the action when current filters hide a loaded selection", () => {
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [packet("AA11")] }));
    usePacketDetail.mockReturnValue({ ...baseDetail(), data: { packetHash: "AA11" } as PacketDetail });
    renderList("/?hash=AA11&q=other");
    expect(screen.getByRole("region", { name: "Selected packet" })).toHaveTextContent("outside the loaded results");
    fireEvent.click(screen.getByRole("button", { name: "Clear", exact: true }));
    expect(screen.queryByRole("region", { name: "Selected packet" })).toBeNull();
    expect(screen.getByRole("button", { name: "AA11", exact: true })).toHaveAttribute("aria-expanded", "true");
  });

  it.each(["/?hash=AA11", "/?hash=AA11&analyze=1", "/"])("does not duplicate a loaded row or an analyzer (%s)", (url) => {
    usePackets.mockImplementation(() => ({ ...basePackets(), allPackets: [packet("AA11")] }));
    renderList(url);
    expect(screen.queryByRole("region", { name: "Selected packet" })).toBeNull();
  });

  it("waits for the initial list before declaring the selection outside it", () => {
    usePackets.mockImplementation(() => ({ ...basePackets(), isLoading: true }));
    renderList("/?hash=AA11");
    expect(screen.queryByRole("region", { name: "Selected packet" })).toBeNull();
  });

  it("shows the selected detail loading state", () => {
    usePacketDetail.mockReturnValue({ ...baseDetail(), isLoading: true });
    renderList("/?hash=AA11");
    expect(screen.getByRole("region", { name: "Selected packet" })).toHaveTextContent("Loading selected packet");
  });

  it.each([[400, "Invalid packet hash"], [404, "Packet not found"], [503, "Failed to load selected packet"]])("explains HTTP %i and lets the user retry", (status, message) => {
    const refetch = vi.fn();
    usePacketDetail.mockReturnValue({ ...baseDetail(), isError: true, error: Object.assign(new Error("request failed"), { status }), refetch });
    renderList("/?hash=AA11");
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    fireEvent.click(screen.getByRole("button", { name: "Retry selected packet" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("dismisses only the selection, leaving the current filters in place", () => {
    usePacketDetail.mockReturnValue({ ...baseDetail(), data: { packetHash: "AA11" } as PacketDetail });
    renderList("/?hash=AA11&q=other&types=4");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss selected packet" }));
    expect(screen.queryByRole("region", { name: "Selected packet" })).toBeNull();
    expect(screen.getByTestId("expanded")).toHaveTextContent("null");
    expect(screen.getByPlaceholderText("Search by hash...")).toHaveValue("other");
    expect(usePackets).toHaveBeenLastCalledWith(false, { payloadTypes: [4] });
  });
});
