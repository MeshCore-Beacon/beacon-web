import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { NodeDetailPanel } from "../../../src/features/nodes/NodeDetailPanel";
import i18n from "../../../src/i18n";
import { getNode, getNodeObservations, getNodeNeighbors, getServerInfo, getNodeTelemetry, getNodePolling } from "../../../src/api/client";
import type { MeshMapperRepeater, Node, NodeNeighbor } from "../../../src/features/nodes/types";

vi.mock("../../../src/api/client", () => ({
  getNode: vi.fn(),
  getNodeObservations: vi.fn(),
  getNodeNeighbors: vi.fn(),
  getServerInfo: vi.fn(),
  getNodeTelemetry: vi.fn(),
  getNodePolling: vi.fn(),
  isNotFound: () => false,
}));
vi.mock("../../../src/features/stats/EChart", () => ({
  EChart: () => <div data-testid="chart" />,
}));

const mockGetNode = vi.mocked(getNode);
const mockGetNodeObservations = vi.mocked(getNodeObservations);
const mockGetNodeNeighbors = vi.mocked(getNodeNeighbors);
const mockGetServerInfo = vi.mocked(getServerInfo);
const mockGetNodeTelemetry = vi.mocked(getNodeTelemetry);
const mockGetNodePolling = vi.mocked(getNodePolling);

const node: Node = {
  id: "node-self",
  publicKey: "aabbccddeeff",
  nodeType: 2,
  nodeTypeName: "REPEATER",
  name: "Self Node",
  lat: null,
  lng: null,
  iatas: [],
  locationSource: null,
  lastAdvertAt: null,
  supportsMultibytePaths: false,
  supportsMultibyteTraces: false,
  minFirmwareVersion: null,
  firstSeen: 1,
  lastSeen: 2,
  metadata: null,
};

function neighbor(id: string, name: string): NodeNeighbor {
  return { id, name, nodeType: 2, nodeTypeName: "REPEATER", iata: "YVR", observationCount: 5, firstSeen: 1, lastSeen: 2 };
}

function renderPanel(onViewNode = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const result = render(<NodeDetailPanel nodeId="node-self" onClose={vi.fn()} onViewObserver={vi.fn()} onViewNode={onViewNode} />, { wrapper });
  return { ...result, onViewNode };
}

beforeEach(() => {
  mockGetNode.mockReset();
  mockGetNodeObservations.mockReset();
  mockGetNodeNeighbors.mockReset();
  mockGetNode.mockResolvedValue(node);
  mockGetNodeObservations.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  mockGetNodeNeighbors.mockResolvedValue([]);
  mockGetServerInfo.mockReset();
  mockGetNodeTelemetry.mockReset();
  mockGetNodePolling.mockReset();
  mockGetServerInfo.mockResolvedValue({ features: { polling: false, accounts: "off", telemetryRequests: false, alerts: false } } as never);
  mockGetNodeTelemetry.mockResolvedValue({ range: "168h", interval: "6h", polled: true, untrustedReadings: 0, points: [{ t: 1_700_000_000_000, readings: 1, batteryMv: 4200 }] });
  mockGetNodePolling.mockResolvedValue({ polled: true, latestReadingAt: 1_700_000_000_000, poller: { observerId: "o1", name: "Poller" }, standbys: [] });
});

function setPolling(on: boolean) {
  mockGetServerInfo.mockResolvedValue({ features: { polling: on, accounts: "off", telemetryRequests: false, alerts: false } } as never);
}

describe("NodeDetailPanel telemetry section", () => {
  it("shows the section for a repeater when polling is on", async () => {
    setPolling(true);
    mockGetNode.mockResolvedValue({ ...node, nodeTypeName: "repeater" });
    renderPanel();
    expect(await screen.findByRole("button", { name: "Poller" })).toBeInTheDocument();
    expect(mockGetNodeTelemetry).toHaveBeenCalled();
  });

  it("shows it for a room server", async () => {
    setPolling(true);
    mockGetNode.mockResolvedValue({ ...node, nodeTypeName: "room_server" });
    renderPanel();
    expect(await screen.findByRole("button", { name: "Poller" })).toBeInTheDocument();
  });

  it("resets the range when the panel switches to another node", async () => {
    setPolling(true);
    // The next node is already cached, so the panel never unmounts the section while it loads.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["node", "node-other"], { ...node, id: "node-other", nodeTypeName: "repeater" });
    mockGetNode.mockResolvedValue({ ...node, nodeTypeName: "repeater" });
    const ui = (id: string) => (
      <QueryClientProvider client={client}>
        <NodeDetailPanel nodeId={id} onClose={vi.fn()} onViewObserver={vi.fn()} />
      </QueryClientProvider>
    );
    const { rerender } = render(ui("node-self"));
    fireEvent.click(await screen.findByRole("button", { name: "24h" }));
    expect(screen.getByRole("button", { name: "24h" })).toHaveAttribute("aria-pressed", "true");
    rerender(ui("node-other"));
    expect(await screen.findByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is absent and fetches nothing when polling is off", async () => {
    mockGetNode.mockResolvedValue({ ...node, nodeTypeName: "repeater" });
    renderPanel();
    await screen.findByText("Self Node");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("button", { name: "Poller" })).not.toBeInTheDocument();
    expect(mockGetNodeTelemetry).not.toHaveBeenCalled();
    expect(mockGetNodePolling).not.toHaveBeenCalled();
  });

  it("is absent and fetches nothing for a companion", async () => {
    setPolling(true);
    mockGetNode.mockResolvedValue({ ...node, nodeTypeName: "companion" });
    renderPanel();
    await screen.findByText("Self Node");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("button", { name: "Poller" })).not.toBeInTheDocument();
    expect(mockGetNodeTelemetry).not.toHaveBeenCalled();
    expect(mockGetNodePolling).not.toHaveBeenCalled();
  });
});

describe("NodeDetailPanel neighbors", () => {
  it("shows the server's possibly-foreign indication", async () => {
    mockGetNode.mockResolvedValue({ ...node, possiblyForeign: true });
    renderPanel();
    expect(await screen.findByText("Possibly foreign")).toBeInTheDocument();
  });

  it.each([false, undefined])("does not label unflagged nodes as foreign (%s)", async (possiblyForeign) => {
    mockGetNode.mockResolvedValue({ ...node, possiblyForeign });
    renderPanel();
    await screen.findByText("Self Node");
    expect(screen.queryByText("Possibly foreign")).not.toBeInTheDocument();
  });
  it("dashes a missing signal on a sent packet and keeps a real zero", async () => {
    const sent = { packetHash: "aa", payloadType: 4, iata: "YOW", heardAt: 1000 };
    mockGetNodeObservations.mockResolvedValue({ items: [
      { ...sent, id: 1, payloadTypeName: "ADVERT", snr: null },
      { ...sent, id: 2, payloadTypeName: "ANON_REQ", snr: 0, rssi: 0 },
    ], nextCursor: null, hasMore: false });
    renderPanel();
    const stat = async (type: string, label: string) => {
      const row = (await screen.findByText(type)).parentElement!.parentElement!;
      return within(row).getByText(label).nextElementSibling!;
    };
    expect(await stat("ADVERT", "SNR")).toHaveTextContent(/^—$/);
    expect(await stat("ADVERT", "RSSI")).toHaveTextContent(/^—$/);
    expect(await stat("ANON_REQ", "SNR")).toHaveTextContent(/^0\.00$/);
    expect(await stat("ANON_REQ", "RSSI")).toHaveTextContent(/^0$/);
  });

  it("lists each neighbor's name in a Neighbors section", async () => {
    mockGetNodeNeighbors.mockResolvedValue([neighbor("n-1", "Neighbor A"), neighbor("n-2", "Neighbor B")]);

    renderPanel();

    expect(await screen.findByText("Neighbors")).toBeInTheDocument();
    expect(await screen.findByText("Neighbor A")).toBeInTheDocument();
    expect(screen.getByText("Neighbor B")).toBeInTheDocument();
    expect(mockGetNodeNeighbors).toHaveBeenCalledWith("node-self", expect.any(AbortSignal));
  });

  it("navigates to a neighbor when its row is clicked", async () => {
    mockGetNodeNeighbors.mockResolvedValue([neighbor("n-1", "Neighbor A")]);

    const { onViewNode } = renderPanel();

    fireEvent.click(await screen.findByText("Neighbor A"));
    expect(onViewNode).toHaveBeenCalledWith("n-1");
  });

  it("shows an empty state when there are no neighbors", async () => {
    mockGetNodeNeighbors.mockResolvedValue([]);

    renderPanel();

    expect(await screen.findByText("No known neighbors")).toBeInTheDocument();
  });
});

describe("NodeDetailPanel location", () => {
  it("hides Lat/Lng but keeps the source for a 0/0 advert reset", async () => {
    mockGetNode.mockResolvedValue({ ...node, lat: 0, lng: 0, locationSource: "advert" });

    renderPanel();

    expect(await screen.findByText("Source")).toBeInTheDocument();
    expect(screen.queryByText("Lat")).not.toBeInTheDocument();
    expect(screen.queryByText("Lng")).not.toBeInTheDocument();
  });
});

describe("NodeDetailPanel clock drift", () => {
  it("shows a repeater's clock drift in amber when the server flags it out of sync", async () => {
    mockGetNode.mockResolvedValue({ ...node, lastAdvertAt: 2, clockDriftSeconds: 432, clockOutOfSync: true, clockCheckedAt: 2 });

    renderPanel();

    const drift = await screen.findByText("+7m 12s ahead");
    expect(drift.className).toContain("text-warn");
  });

  it("shows an in-sync drift in green", async () => {
    mockGetNode.mockResolvedValue({ ...node, lastAdvertAt: 2, clockDriftSeconds: 20, clockOutOfSync: false, clockCheckedAt: 2 });

    renderPanel();

    const drift = await screen.findByText("+20s ahead");
    expect(drift.className).toContain("text-green");
  });

  it("omits clock drift entirely when the node reports none", async () => {
    renderPanel();

    await screen.findByText("Timestamps");
    expect(screen.queryByText(/Clock drift/i)).not.toBeInTheDocument();
  });
});

describe("NodeDetailPanel View on map", () => {
  function renderWithMap(onViewOnMap?: (lat: number, lng: number) => void) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NodeDetailPanel nodeId="node-self" onClose={vi.fn()} onViewObserver={vi.fn()} onViewOnMap={onViewOnMap} />
      </QueryClientProvider>,
    );
  }

  it("sends the node's coordinates", async () => {
    mockGetNode.mockResolvedValue({ ...node, lat: 45.42153, lng: -75.69719 });
    const onViewOnMap = vi.fn();
    renderWithMap(onViewOnMap);
    fireEvent.click(await screen.findByRole("button", { name: "View on map" }));
    expect(onViewOnMap).toHaveBeenCalledWith(45.42153, -75.69719);
  });

  it("is not offered for a node without a location", async () => {
    renderWithMap(vi.fn());
    await screen.findByText("Self Node");
    expect(screen.queryByRole("button", { name: "View on map" })).not.toBeInTheDocument();
  });

  it("is not offered when the caller has no map to open", async () => {
    mockGetNode.mockResolvedValue({ ...node, lat: 45.42153, lng: -75.69719 });
    renderWithMap();
    await screen.findByText("Self Node");
    expect(screen.queryByRole("button", { name: "View on map" })).not.toBeInTheDocument();
  });

  it("shows the French label", async () => {
    mockGetNode.mockResolvedValue({ ...node, lat: 45.42153, lng: -75.69719 });
    await act(() => i18n.changeLanguage("fr"));
    renderWithMap(vi.fn());
    expect(await screen.findByRole("button", { name: "Voir sur la carte" })).toBeInTheDocument();
    await act(() => i18n.changeLanguage("en"));
  });

  it("is not offered for an explicit 0/0 advert reset", async () => {
    mockGetNode.mockResolvedValue({ ...node, lat: 0, lng: 0 });
    renderWithMap(vi.fn());
    await screen.findByText("Self Node");
    expect(screen.queryByRole("button", { name: "View on map" })).not.toBeInTheDocument();
  });

  it("is still offered when only one axis is zero", async () => {
    mockGetNode.mockResolvedValue({ ...node, lat: 0, lng: 10 });
    const onViewOnMap = vi.fn();
    renderWithMap(onViewOnMap);
    fireEvent.click(await screen.findByRole("button", { name: "View on map" }));
    expect(onViewOnMap).toHaveBeenCalledWith(0, 10);
  });
});

describe("NodeDetailPanel packets sent", () => {
  it("labels the list as packets the node sent and explains why only some show", async () => {
    renderPanel();
    const title = await screen.findByText("Packets sent");
    expect(await screen.findByText("No packets sent")).toBeInTheDocument();
    expect(screen.queryByText("Recent packets")).not.toBeInTheDocument();
    const tip = title.closest("summary")!.querySelector(".sr-only")!;
    expect(tip).toHaveTextContent("Adverts and login requests this node sent.");
    expect(tip).toHaveTextContent("Other packets don't name their sender in full");
  });
});

describe("NodeDetailPanel in French", () => {
  it("translates section titles, labels, yes/no and empty states", async () => {
    mockGetNode.mockResolvedValue({ ...node, knownNeighborCount: 2, clockDriftSeconds: 20, clockOutOfSync: false, clockCheckedAt: 2 });
    await act(() => i18n.changeLanguage("fr"));
    renderPanel();

    expect(await screen.findByText("Capacités")).toBeInTheDocument();
    expect(screen.getByText("Détail du nœud")).toBeInTheDocument();
    expect(screen.getByText("Chemins multi-octets")).toBeInTheDocument();
    expect(screen.getAllByText("non")).toHaveLength(2);
    expect(screen.getByText("+20 s en avance")).toBeInTheDocument();
    expect(screen.getByText("Voisins (2)")).toBeInTheDocument();
    expect(await screen.findByText("Aucun voisin connu")).toBeInTheDocument();
    expect(screen.getByText("Aucun paquet envoyé")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copier la clé publique" })).toBeInTheDocument();
  });

  it("translates the possibly-foreign badge", async () => {
    mockGetNode.mockResolvedValue({ ...node, possiblyForeign: true });
    await act(() => i18n.changeLanguage("fr"));
    renderPanel();
    expect(await screen.findByText("Possiblement étranger")).toBeInTheDocument();
  });
});

describe("NodeDetailPanel MeshMapper", () => {
  const meshmapper: MeshMapperRepeater = {
    iata: "YOW",
    fetchedAt: Date.now() - 60_000,
    site: {
      power: "1W", hardware: "RAK4631", antenna: "5.8 dBi fibreglass",
      heightM: 12, heightAslM: 341.6, powerSource: "solar",
      notes: "On the fire tower, east face",
    },
    carpeater: false,
    admins: ["MrAlders0n"],
    scopes: [
      { scope: "yow", observedAt: Date.now() - 3_600_000, observedPackets: 37, proof: "multibyte", reportedAt: Date.now() - 7_200_000 },
    ],
    scopesCheckedAt: Date.now() - 7_200_000,
    defaultScope: { name: "#yow", state: "named", updatedAt: Date.now() - 180_000, source: "advert" },
  };
  const empty: MeshMapperRepeater = { fetchedAt: 1, site: {}, carpeater: false, admins: [], scopes: [] };

  it("shows MeshMapper's site details, admins and scopes", async () => {
    mockGetNode.mockResolvedValue({ ...node, meshmapper });
    renderPanel();

    expect(await screen.findByText("MeshMapper")).toBeInTheDocument();
    expect(screen.getByText("RAK4631")).toBeInTheDocument();
    expect(screen.getByText("1W")).toBeInTheDocument();
    expect(screen.getByText("5.8 dBi fibreglass")).toBeInTheDocument();
    expect(screen.getByText("Solar")).toBeInTheDocument();
    expect(screen.getByText("12 m AGL · 341.6 m ASL")).toBeInTheDocument();
    expect(screen.getByText("MrAlders0n")).toBeInTheDocument();
    expect(screen.getByText("#yow")).toBeInTheDocument();
    expect(screen.getByText("yow")).toBeInTheDocument();
    expect(screen.getByText("observed 37 packets · reported")).toBeInTheDocument();
    expect(screen.getByText("On the fire tower, east face")).toBeInTheDocument();
    expect(screen.getByText(/More information:.*From MeshMapper \(YOW\)/)).toBeInTheDocument();
    expect(screen.queryByText("CARpeater")).not.toBeInTheDocument();
    const fold = screen.getByText("MeshMapper").closest("details")!;
    expect(fold).not.toHaveAttribute("open");
    expect(fold.querySelector("summary")).toHaveTextContent("YOW · 1 scope");
  });

  it("never shows MeshMapper's proof type", async () => {
    mockGetNode.mockResolvedValue({ ...node, meshmapper: { ...empty, scopes: [{ scope: "yow", observedPackets: 3, proof: "floor" }] } });
    renderPanel();
    expect(await screen.findByText("observed 3 packets")).toBeInTheDocument();
    expect(screen.queryByText(/floor/)).not.toBeInTheDocument();
  });

  it("describes a scope confirmed only by report or upload", async () => {
    mockGetNode.mockResolvedValue({ ...node, meshmapper: { ...empty, scopes: [{ scope: "yow", reportedAt: 1, uploadedAt: 2 }] } });
    renderPanel();
    expect(await screen.findByText("reported · uploaded")).toBeInTheDocument();
  });

  it("shows height above ground alone when sea level is missing", async () => {
    mockGetNode.mockResolvedValue({ ...node, meshmapper: { ...empty, site: { heightM: 12 } } });
    renderPanel();
    expect(await screen.findByText("12 m AGL")).toBeInTheDocument();
  });

  it("formats heights in the reader's locale", async () => {
    mockGetNode.mockResolvedValue({ ...node, meshmapper: { ...empty, site: { heightM: 12.25, heightAslM: 341.6 } } });
    await act(() => i18n.changeLanguage("fr"));
    renderPanel();
    expect(await screen.findByText("12,3 m AGL · 341,6 m ASL")).toBeInTheDocument();
    await act(() => i18n.changeLanguage("en"));
  });

  it("is hidden when the node has no MeshMapper record", async () => {
    renderPanel();
    await screen.findByText("Self Node");
    expect(screen.queryByText("MeshMapper")).not.toBeInTheDocument();
    expect(screen.queryByText(/From MeshMapper/)).not.toBeInTheDocument();
  });

  it.each([
    ["nothing set", empty],
    ["only a CARpeater flag", { ...empty, carpeater: true }],
    ["only a sea-level height", { ...empty, site: { heightAslM: 341.6 } }],
  ])("is hidden when the record has %s", async (_, mm) => {
    mockGetNode.mockResolvedValue({ ...node, meshmapper: mm });
    renderPanel();
    await screen.findByText("Self Node");
    expect(screen.queryByText(/From MeshMapper/)).not.toBeInTheDocument();
  });

  it("shows an unknown default scope and an answered-but-empty scope list", async () => {
    mockGetNode.mockResolvedValue({ ...node, meshmapper: { ...empty, scopesCheckedAt: 1, defaultScope: { state: "unknown" } } });
    renderPanel();
    expect(await screen.findByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("None confirmed")).toBeInTheDocument();
  });

  it("shows a default scope of none", async () => {
    mockGetNode.mockResolvedValue({ ...node, meshmapper: { ...empty, defaultScope: { state: "none" } } });
    renderPanel();
    expect(await screen.findByText("None")).toBeInTheDocument();
  });

  it("badges a CARpeater next to the name, reachable by keyboard", async () => {
    mockGetNode.mockResolvedValue({ ...node, meshmapper: { ...meshmapper, carpeater: true } });
    renderPanel();
    const badge = await screen.findByText("CARpeater");
    expect(badge.className).not.toContain("uppercase");
    const trigger = badge.parentElement!;
    expect(trigger).toHaveAttribute("tabindex", "0");
    expect(trigger).toHaveAccessibleDescription("Mobile repeater in a vehicle: its position moves.");
  });

  it("renders admin-entered markup as plain text", async () => {
    mockGetNode.mockResolvedValue({ ...node, meshmapper: { ...meshmapper, site: { notes: "<b>bold</b>" } } });
    const { container } = renderPanel();
    expect(await screen.findByText("<b>bold</b>")).toBeInTheDocument();
    expect(container.querySelector("b")).toBeNull();
  });
});

describe("NodeDetailPanel layout", () => {
  beforeEach(() => localStorage.clear());

  it("shows when the node was last seen in the summary", async () => {
    renderPanel();
    const name = await screen.findByText("Self Node");
    const summary = name.closest("[data-summary]") as HTMLElement;
    expect(summary).toHaveTextContent(/Last seen/);
  });

  it("keeps Summary and Details open, puts MeshMapper next and folds the rest by default", async () => {
    setPolling(true);
    mockGetNode.mockResolvedValue({ ...node, minFirmwareVersion: "1.14.0", lat: 45.4215, lng: -75.6972, locationSource: "advert", meshmapper: { iata: "YOW", fetchedAt: 1, site: { hardware: "RAK4631" }, carpeater: false, admins: [], scopes: [] } });
    renderPanel();
    await screen.findByRole("button", { name: "Poller" });
    const titles = ["Summary", "Details", "MeshMapper", "Telemetry", "Neighbors", "Packets sent"].map((text) => screen.getByText(text));
    for (let i = 1; i < titles.length; i++) {
      expect(titles[i - 1]!.compareDocumentPosition(titles[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    for (const title of titles.slice(0, 2)) expect(title.closest("details")).toBeNull();
    for (const title of titles.slice(2)) expect(title.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Capabilities")).toBeVisible();
    expect(screen.getByText("Telemetry").closest("summary")).toHaveTextContent(/Polled · /);
  });

  it("remembers a fold left open", async () => {
    const first = renderPanel();
    const summary = (await screen.findByText("Neighbors")).closest("summary")!;
    fireEvent.click(summary);
    await waitFor(() => expect(summary.closest("details")).toHaveAttribute("open"));
    first.unmount();
    renderPanel();
    expect((await screen.findByText("Neighbors")).closest("details")).toHaveAttribute("open");
  });

  it("keeps View on map in the summary", async () => {
    mockGetNode.mockResolvedValue({ ...node, lat: 45.4, lng: -75.7 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NodeDetailPanel nodeId="node-self" onClose={vi.fn()} onViewObserver={vi.fn()} onViewOnMap={vi.fn()} />
      </QueryClientProvider>,
    );
    const link = await screen.findByRole("button", { name: "View on map" });
    expect(link.closest("[data-summary]")).not.toBeNull();
  });
});
