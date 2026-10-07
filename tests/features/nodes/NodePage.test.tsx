import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { NodePage } from "../../../src/features/nodes/NodePage";
import { getNode, getNodeObservations, getNodeNeighbors } from "../../../src/api/client";
import type { Node } from "../../../src/features/nodes/types";

vi.mock("../../../src/api/client", async () => ({ ...await vi.importActual("../../../src/api/client"), getNode: vi.fn(), getNodeObservations: vi.fn(), getNodeNeighbors: vi.fn(), getObserver: vi.fn(), getObserverTelemetry: vi.fn(), getCollectedNodeTelemetry: vi.fn(async () => ({ items: [], limit: 500 })) }));
const id = "11111111-1111-4111-8111-111111111111";
const now = Date.now();
const node = { id, publicKey: "ab".repeat(32), name: "Roof repeater", nodeTypeName: "repeater", iatas: [], knownNeighborCount: 1, firstSeen: now - 100_000, lastSeen: now, observerId: undefined } as Node;
function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function mount(nodeId = id) {
  const actions = { onViewNode: vi.fn(), onViewObserver: vi.fn(), onAnalyzePacket: vi.fn() };
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[`/?tab=Nodes&nodePage=${nodeId}&iata=YKF`]}><NodePage nodeId={nodeId} {...actions} /><Location /></MemoryRouter></QueryClientProvider>);
  return actions;
}
describe("full node page", () => {
  it("distinguishes a server failure from a missing node and supports retry", async () => {
    vi.mocked(getNode).mockRejectedValueOnce(Object.assign(new Error("unavailable"), { status: 503 })).mockResolvedValue(node);
    vi.mocked(getNodeNeighbors).mockResolvedValue([]);
    vi.mocked(getNodeObservations).mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Node details could not be loaded.");
    expect(screen.queryByText("Node not found")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Roof repeater" });
  });
  it("loads one bounded report sample and preserves inspection and back context", async () => {
    vi.mocked(getNode).mockResolvedValue(node);
    vi.mocked(getNodeNeighbors).mockResolvedValue([]);
    vi.mocked(getNodeObservations).mockResolvedValue({ items: [{ id: 9, packetHash: "0123456789abcdef", payloadType: 4, payloadTypeName: "ADVERT", iata: "YKF", heardAt: now - 1000, rssi: -90, snr: 0, hopCount: 2 }], hasMore: true, nextCursor: 9 });
    const actions = mount();
    await screen.findByRole("heading", { name: "Roof repeater" });
    fireEvent.click(await screen.findByText("01234567"));
    expect(actions.onAnalyzePacket).toHaveBeenCalledWith("0123456789abcdef", 9);
    expect(getNodeObservations).toHaveBeenCalledWith(id, { limit: 200 }, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Inspect node" }));
    expect(actions.onViewNode).toHaveBeenCalledWith(id);
    fireEvent.click(screen.getByRole("button", { name: /← Nodes/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("?tab=Nodes&iata=YKF");
  });
  it("does not request data for an invalid node identity", async () => {
    vi.mocked(getNode).mockClear();
    mount("not-a-node");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(getNode).not.toHaveBeenCalled();
  });
});
