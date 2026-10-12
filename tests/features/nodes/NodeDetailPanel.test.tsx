import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { NodeDetailPanel } from "../../../src/features/nodes/NodeDetailPanel";
import i18n from "../../../src/i18n";
import { getNode, getNodeObservations, getNodeNeighbors } from "../../../src/api/client";
import type { MeshMapperRepeater, Node, NodeNeighbor } from "../../../src/features/nodes/types";

vi.mock("../../../src/api/client", () => ({
  getNode: vi.fn(),
  getNodeObservations: vi.fn(),
  getNodeNeighbors: vi.fn(),
}));

const mockGetNode = vi.mocked(getNode);
const mockGetNodeObservations = vi.mocked(getNodeObservations);
const mockGetNodeNeighbors = vi.mocked(getNodeNeighbors);

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
  it("lists each neighbor's name in a Neighbors section", async () => {
    mockGetNodeNeighbors.mockResolvedValue([neighbor("n-1", "Neighbor A"), neighbor("n-2", "Neighbor B")]);

    renderPanel();

    expect(await screen.findByText("Neighbors")).toBeInTheDocument();
    expect(await screen.findByText("Neighbor A")).toBeInTheDocument();
    expect(screen.getByText("Neighbor B")).toBeInTheDocument();
    expect(mockGetNodeNeighbors).toHaveBeenCalledWith("node-self");
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

describe("NodeDetailPanel recent packets", () => {
  it("labels the expiring packet list as recent packets", async () => {
    renderPanel();
    expect(await screen.findByText("Recent packets")).toBeInTheDocument();
    expect(await screen.findByText("No recent packets")).toBeInTheDocument();
    expect(screen.queryByText("Observations")).not.toBeInTheDocument();
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
    expect(screen.getByText("Aucun paquet récent")).toBeInTheDocument();
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
    expect(screen.getByText(/From MeshMapper/)).toBeInTheDocument();
    expect(screen.queryByText("CARpeater")).not.toBeInTheDocument();
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
