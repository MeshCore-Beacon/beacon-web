import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../../src/i18n";
import { ObserverPoller } from "../../../src/features/observers/ObserverPoller";
import { ObserverSummary } from "../../../src/features/observers/ObserverSummary";
import { RoleChip } from "../../../src/components/NodeChips";
import { getNodePoller } from "../../../src/api/client";
import type { NodePoller } from "../../../src/features/nodes/types";
import type { Observer } from "../../../src/features/observers/types";

vi.mock("../../../src/api/client", () => ({
  getNodePoller: vi.fn(),
  isNotFound: (err: unknown) => (err as { status?: number } | null)?.status === 404,
}));

const now = Date.now();
const poller: NodePoller = {
  claim: { receivedAt: now - 5 * 60_000, live: true, acceptsRequests: true, slots: { max: 8, used: 2, own: 2, requested: 0, free: 6 } },
  readings24h: 212,
  targets: [
    { nodeId: "n-a", publicKey: "aa".repeat(32), name: "Alpha", requested: false, role: "poller", rank: 0, state: "ok", misses: 0, lastAttempt: now, lastOk: now, claimedSnr: 9, evidenceSnr: 9, evidenceCount: 3, latestReadingAt: now },
    { nodeId: null, publicKey: "bb".repeat(32), name: "Bravo", requested: false, role: "poller", rank: 0, state: "ok", misses: 0, lastAttempt: now, lastOk: now, claimedSnr: 9, evidenceSnr: 9, evidenceCount: 3, latestReadingAt: now },
  ],
};

function mount(onViewNode = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><ObserverPoller nodeId="n-self" onViewNode={onViewNode} /></QueryClientProvider>);
  return { ...view, onViewNode };
}
const settled = async () => {
  await waitFor(() => expect(getNodePoller).toHaveBeenCalled());
  await act(async () => {});
};

beforeEach(() => vi.clearAllMocks());

describe("ObserverPoller", () => {
  it("shows the slots and a grid of the repeaters under a Poller heading", async () => {
    vi.mocked(getNodePoller).mockResolvedValue(poller);
    mount();
    const block = await screen.findByRole("region", { name: "Poller" });
    expect(within(block).getByRole("heading", { level: 2, name: "Poller" })).toBeInTheDocument();
    expect(within(block).getByRole("img")).toHaveAccessibleName("2 of 8 slots used: 2 own, 0 requested, 6 free");
    expect(within(block).getByText("212")).toBeInTheDocument();
    const cards = block.querySelectorAll("[data-target]");
    expect(cards).toHaveLength(2);
    expect(cards[0]!.parentElement).toHaveClass("grid");
  });

  it("opens a repeater that is a known node", async () => {
    vi.mocked(getNodePoller).mockResolvedValue(poller);
    const { onViewNode } = mount();
    fireEvent.click(await screen.findByText("Alpha"));
    expect(onViewNode).toHaveBeenCalledWith("n-a");
    fireEvent.click(screen.getByText("Bravo"));
    expect(onViewNode).toHaveBeenCalledTimes(1);
  });

  it("draws nothing on a server without the route", async () => {
    vi.mocked(getNodePoller).mockRejectedValue({ status: 404 });
    const { container } = mount();
    await settled();
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing for a radio with no claim", async () => {
    vi.mocked(getNodePoller).mockResolvedValue({ claim: null, readings24h: 0, targets: [] });
    const { container } = mount();
    await settled();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ObserverSummary badges", () => {
  const observer = { id: "observer", displayName: "Roof", iata: "YKF", brokers: [], lastStatusAt: now } as unknown as Observer;

  it("puts them on the name row", () => {
    render(<ObserverSummary observer={observer} points={[]} badges={<RoleChip role="poller" />} />);
    expect(screen.getByText("Poller").parentElement).toBe(screen.getByRole("heading", { level: 1 }).parentElement);
  });

  it("leaves them out of the compact form", () => {
    render(<ObserverSummary observer={observer} points={[]} compact badges={<RoleChip role="poller" />} />);
    expect(screen.queryByText("Poller")).not.toBeInTheDocument();
  });
});
