import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AtlasCard } from "../../../src/features/atlas/AtlasCard";
import * as api from "../../../src/api/client";
import { ApiError } from "../../../src/api/client";
import { formatHex } from "../../../src/lib/formatters";
import type { Node } from "../../../src/features/nodes/types";
import type { PacketDetail } from "../../../src/types/api";

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getNode: vi.fn(),
  getNodeObservations: vi.fn(),
  getNodesPage: vi.fn(),
  getPacketDetail: vi.fn(),
}));

const pin = { id: "11111111-1111-4111-8111-111111111111", publicKey: "ab".repeat(32), name: "Old name" };
const node = { ...pin, name: "Renamed repeater", nodeType: 2, nodeTypeName: "REPEATER", knownNeighborCount: 4, stale: false, lastSeen: Date.now(), iatas: [], lat: null, lng: null } as Node;
const report = { id: 7, packetHash: "ef".repeat(32), payloadType: 4, payloadTypeName: "ADVERT", iata: "YKF", heardAt: Date.now() - 1000, snr: 0, rssi: -106, hopCount: 2 };
const detail = { packetHash: report.packetHash, originPubkey: pin.publicKey, header: { payloadType: 4 }, observations: [
  { observerId: "observer-a", observerName: "Home listener", id: 1, heardAt: 1, iata: "YKF" },
  { observerId: "observer-a", observerName: "Home listener", id: 2, heardAt: 2, iata: "YKF" },
  { observerId: "observer-b", observerName: "Hill listener", id: 3, heardAt: 3, iata: "YKF" },
] } as unknown as PacketDetail;
const handlers = {
  onViewNode: vi.fn(),
  onViewObserver: vi.fn(),
  onAnalyzePacket: vi.fn(),
  onHeardToggle: vi.fn(),
  onRemove: vi.fn(),
  onResolved: vi.fn(),
};
let client: QueryClient;

function mount(overrides: Partial<Parameters<typeof AtlasCard>[0]> = {}) {
  return render(
    <QueryClientProvider client={client}>
      <AtlasCard pin={pin} range="24h" active heardOpen={false} handle={{}} {...handlers} {...overrides} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  vi.mocked(api.getNode).mockResolvedValue(node);
  vi.mocked(api.getNodeObservations).mockResolvedValue({ items: [report], hasMore: true, nextCursor: 7 });
  vi.mocked(api.getPacketDetail).mockResolvedValue(detail);
});
afterEach(() => client.clear());

describe("AtlasCard", () => {
  it("renders the Signal tab tiles for one node with its type and freshness badges", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Renamed repeater" })).toBeInTheDocument();
    expect(screen.getByText("REPEATER")).toBeInTheDocument();
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("Observations")).toBeInTheDocument();
    expect(screen.getByText("Mean SNR")).toBeInTheDocument();
    expect(screen.getByText("0.0 dB")).toBeInTheDocument();
    expect(screen.getByText("-106.0 dBm")).toBeInTheDocument();
    expect(screen.getByText("Active hours")).toBeInTheDocument();
    expect(screen.getByText("latest 200")).toBeInTheDocument();
    expect(screen.queryByText(/battery|telemetry/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renamed repeater" }));
    expect(handlers.onViewNode).toHaveBeenCalledWith(pin.id);
  });

  it("shows the stale badge and the server's type name even when the type is unknown", async () => {
    vi.mocked(api.getNode).mockResolvedValue({ ...node, stale: true, nodeType: 9, nodeTypeName: "WEIRD" });
    mount();
    expect(await screen.findByText("Stale")).toBeInTheDocument();
    expect(screen.getByText("WEIRD")).toBeInTheDocument();
    expect(screen.queryByText(/atlas\.roles/)).not.toBeInTheDocument();
  });

  it("reports a server ID that differs from the pin so the page can update it", async () => {
    const recovered = "22222222-2222-4222-8222-222222222222";
    vi.mocked(api.getNode).mockResolvedValue({ ...node, id: recovered });
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(handlers.onResolved).toHaveBeenCalledWith(recovered);
  });

  it("leaves the pin alone when the server ID still matches", async () => {
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(handlers.onResolved).not.toHaveBeenCalled();
  });

  it("lets the action buttons drop under the title instead of squeezing the name", async () => {
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    const actions = screen.getByRole("button", { name: "Remove" }).parentElement!;
    expect(actions).toHaveClass("ml-auto");
    expect(actions.parentElement).toHaveClass("flex-wrap");
  });

  it("fills its grid row so neighbouring cards stay the same height whatever their titles wrap to", async () => {
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    const tiles = screen.getByText("Observations").closest(".grid")!;
    expect(tiles).toHaveClass("flex-1");
    expect(tiles.parentElement).toHaveClass("flex-1");
    expect(tiles.closest(".rounded-lg.border.p-3\\.5")).toHaveClass("flex", "h-full", "flex-col");
    expect(screen.getByText("-106.0 dBm")).toHaveClass("text-xl");
  });

  it("labels an unnamed node by its ID prefix, dimmed, as the Nodes page does", async () => {
    vi.mocked(api.getNode).mockResolvedValue({ ...node, name: "" });
    mount({ pin: { ...pin, name: "" } });
    const title = await screen.findByRole("button", { name: formatHex(pin.id) });
    expect(title).toHaveClass("italic");
  });

  it("says the node is gone instead of offering a retry when the server has no such key", async () => {
    vi.mocked(api.getNode).mockRejectedValue(new ApiError(404, "not_found", "missing"));
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    mount();
    expect(await screen.findByText("Node not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
  });

  it("renders dashes for an empty sample without NaN", async () => {
    vi.mocked(api.getNodeObservations).mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("0/24")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getByText("24h")).toBeInTheDocument();
  });

  it("flips the body between the tiles and the heard-by list instead of growing the card", async () => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 240 });
    const view = mount();
    await screen.findByRole("button", { name: "Renamed repeater" });
    expect(api.getPacketDetail).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Move/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drag to reorder" })).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Heard by" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    // Both labels stay in the button, stacked, so flipping never changes its width and wraps the header.
    expect(toggle.querySelector('[aria-hidden="true"]')).toHaveTextContent("Analytics");
    expect(toggle.querySelector('[aria-hidden="true"]')).toHaveClass("invisible", "col-start-1", "row-start-1");
    fireEvent.click(toggle);
    expect(handlers.onHeardToggle).toHaveBeenCalled();
    view.rerender(
      <QueryClientProvider client={client}>
        <AtlasCard pin={pin} range="24h" active heardOpen handle={{}} {...handlers} />
      </QueryClientProvider>,
    );
    const summary = await screen.findByText(/2 observers heard the latest packet/);
    expect(summary).toHaveTextContent(/ago$/);
    expect(screen.getByRole("button", { name: "Analytics" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Analytics" }).querySelector('[aria-hidden="true"]')).toHaveTextContent("Heard by");
    expect(screen.queryByText("Mean SNR")).not.toBeInTheDocument();
    expect(summary.parentElement).toHaveStyle({ height: "240px" });
    expect(summary.nextElementSibling).toHaveClass("overflow-y-auto");
    expect(screen.getAllByRole("button", { name: "Home listener" })).toHaveLength(1);
    expect(screen.getAllByText("YKF")[0]).toHaveClass("bg-primary/6");
    fireEvent.click(screen.getByRole("button", { name: "Home listener" }));
    expect(handlers.onViewObserver).toHaveBeenCalledWith("observer-a");
    fireEvent.click(screen.getByRole("button", { name: "Open packet" }));
    expect(handlers.onAnalyzePacket).toHaveBeenCalledWith(report.packetHash, 7);
    delete (HTMLElement.prototype as { offsetHeight?: unknown }).offsetHeight;
  });

  it("hides observer links for a different origin identity and explains expired packets", async () => {
    vi.mocked(api.getPacketDetail).mockResolvedValue({ ...detail, originPubkey: "cd".repeat(32) });
    mount({ heardOpen: true });
    expect(await screen.findByText("Packet details are unavailable or expired.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open packet" })).not.toBeInTheDocument();
  });

  it("keeps an unavailable node removable and draggable", async () => {
    vi.mocked(api.getNode).mockRejectedValue(new Error("down"));
    mount({ handle: { "data-grip": "yes" } as Record<string, string> });
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load");
    expect(screen.getByRole("button", { name: "Drag to reorder" })).toHaveAttribute("data-grip", "yes");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(handlers.onRemove).toHaveBeenCalled();
    expect(screen.queryByText("Mean SNR")).not.toBeInTheDocument();
  });
});
