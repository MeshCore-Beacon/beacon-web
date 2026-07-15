import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { PacketList } from "../../../src/features/packets/PacketList";
import type { WsManager } from "../../../src/api/ws-manager";
import type { PacketSummary } from "../../../src/types/api";

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

vi.mock("../../../src/hooks/useScopes", () => ({ useScopes: () => [] }));

vi.mock("../../../src/hooks/useRegion", () => ({
  useRegion: () => ({ iatas: ["YOW"], regionKey: "YOW" }),
}));

vi.mock("../../../src/hooks/useWsHandlers", () => ({
  useWsPacketHandler: () => {},
  useWsLaggedHandler: () => {},
}));

// the virtual list needs ResizeObserver in jsdom; stub it down to the expand wiring under test
vi.mock("../../../src/features/packets/PacketVirtualList", () => ({
  PacketVirtualList: ({
    expandedHash,
    onToggleExpand,
  }: {
    expandedHash: string | null;
    onToggleExpand: (hash: string) => void;
  }) => (
    <div>
      <div data-testid="expanded">{String(expandedHash)}</div>
      <button type="button" onClick={() => onToggleExpand("h1")}>toggle-h1</button>
    </div>
  ),
}));

// stands in for the analyzer drawer's close button, which clears ?hash from outside PacketList
function ExternalHashCloser() {
  const [, setSearchParams] = useSearchParams();
  return (
    <button
      type="button"
      onClick={() =>
        setSearchParams((p) => {
          const n = new URLSearchParams(p);
          n.delete("hash");
          return n;
        })
      }
    >
      close-url
    </button>
  );
}

describe("PacketList server filter wiring", () => {
  function renderAt(url: string) {
    render(
      <MemoryRouter initialEntries={[url]}>
        <PacketList wsManager={{} as unknown as WsManager} onAnalyze={vi.fn()} />
      </MemoryRouter>,
    );
  }

  it("passes a single selected type to usePackets as the server filter", () => {
    usePackets.mockClear();
    renderAt("/?types=4");
    expect(usePackets).toHaveBeenLastCalledWith(false, { payloadType: 4 });
  });

  it("passes null for multi-select so history stays unfiltered", () => {
    usePackets.mockClear();
    renderAt("/?types=2,4");
    expect(usePackets).toHaveBeenLastCalledWith(false, null);
  });
});

describe("PacketList loading feedback", () => {
  afterEach(() => {
    usePackets.mockImplementation(basePackets);
  });

  function renderList() {
    render(
      <MemoryRouter>
        <PacketList wsManager={{} as unknown as WsManager} onAnalyze={vi.fn()} />
      </MemoryRouter>,
    );
  }

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
  it("follows the ?hash param so an external analyzer close deselects the row", () => {
    const onAnalyze = vi.fn();
    render(
      <MemoryRouter initialEntries={["/?hash=h1"]}>
        <PacketList wsManager={{} as unknown as WsManager} onAnalyze={onAnalyze} />
        <ExternalHashCloser />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("expanded").textContent).toBe("h1");

    // analyzer drawer closed elsewhere — row must deselect
    fireEvent.click(screen.getByText("close-url"));
    expect(screen.getByTestId("expanded").textContent).toBe("null");

    // clicking the same row again must reopen, not collapse
    fireEvent.click(screen.getByText("toggle-h1"));
    expect(screen.getByTestId("expanded").textContent).toBe("h1");
    expect(onAnalyze).toHaveBeenLastCalledWith("h1");
  });
});
