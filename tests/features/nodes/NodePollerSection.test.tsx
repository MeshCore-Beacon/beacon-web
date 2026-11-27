import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NodePollerSection } from "../../../src/features/nodes/NodePollerSection";
import { getNodePoller } from "../../../src/api/client";
import type { NodePoller, NodePollerTarget } from "../../../src/features/nodes/types";

vi.mock("../../../src/api/client", () => ({
  getNodePoller: vi.fn(),
  isNotFound: (err: unknown) => (err as { status?: number } | null)?.status === 404,
}));

const now = Date.now();
const key = (prefix: string) => prefix.padEnd(64, "0");
const target = (over: Partial<NodePollerTarget> = {}): NodePollerTarget => ({
  nodeId: "n-a", publicKey: key("5be1c07a"), name: "Alpha", requested: false, role: "poller", rank: 0, state: "ok", misses: 0,
  lastAttempt: now - 60_000, lastOk: now - 120_000, claimedSnr: 11.25, evidenceSnr: 10.4, evidenceCount: 22, latestReadingAt: now - 180_000,
  ...over,
});
const poller = (over: Partial<NodePoller> = {}, claim: Partial<NonNullable<NodePoller["claim"]>> = {}): NodePoller => ({
  claim: { receivedAt: now - 5 * 60_000, live: true, acceptsRequests: true, slots: { max: 8, used: 5, own: 3, requested: 2, free: 1 }, ...claim },
  readings24h: 212,
  targets: [target()],
  ...over,
});

function mount(data: NodePoller, onViewNode = vi.fn()) {
  vi.mocked(getNodePoller).mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><NodePollerSection nodeId="n-self" onViewNode={onViewNode} /></QueryClientProvider>);
  return { onViewNode };
}
const seats = (kind: string) => screen.getByRole("img").querySelectorAll(`[data-seat="${kind}"]`).length;
const card = (name: string) => screen.getByText(name).closest("[data-target]") as HTMLElement;

beforeEach(() => vi.clearAllMocks());

describe("NodePollerSection summary", () => {
  it("draws every seat and names them, with the ones not offered", async () => {
    mount(poller());
    const meter = await screen.findByRole("img");
    expect(meter).toHaveAccessibleName("5 of 8 slots used: 3 own, 2 requested, 1 free, 2 not offered");
    expect([seats("own"), seats("requested"), seats("free"), seats("closed")]).toEqual([3, 2, 1, 2]);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("/ 8")).toBeInTheDocument();
    expect(screen.getByText("2 not offered")).toBeInTheDocument();
  });

  it("leaves 'not offered' out when every seat is used or free", async () => {
    mount(poller({}, { slots: { max: 8, used: 5, own: 3, requested: 2, free: 3 } }));
    const meter = await screen.findByRole("img");
    expect(meter).toHaveAccessibleName("5 of 8 slots used: 3 own, 2 requested, 3 free");
    expect(seats("closed")).toBe(0);
    expect(screen.queryByText(/not offered/)).not.toBeInTheDocument();
  });

  it("never draws more seats than the maximum", async () => {
    mount(poller({}, { slots: { max: 4, used: 5, own: 3, requested: 2, free: 2 } }));
    await screen.findByRole("img");
    expect(screen.getByRole("img").querySelectorAll("[data-seat]")).toHaveLength(4);
  });

  it("shows the claim age, request intake and readings", async () => {
    mount(poller());
    expect(await screen.findByText("Last claim")).toBeInTheDocument();
    expect(screen.getByText("accepting")).toBeInTheDocument();
    expect(screen.getByText("212")).toBeInTheDocument();
    expect(screen.queryByText(/Not currently polling/)).not.toBeInTheDocument();
  });

  it("says when requests are not accepted", async () => {
    mount(poller({}, { acceptsRequests: false }));
    expect(await screen.findByText("not accepting")).toBeInTheDocument();
  });

  it("warns about a stale claim and dims the meter and rows", async () => {
    mount(poller({}, { live: false, receivedAt: now - 3 * 3_600_000 }));
    const line = await screen.findByText(/Not currently polling\. Last claim/);
    expect(line).toHaveClass("text-warn");
    expect(line).toHaveTextContent("3h ago");
    expect(screen.getByRole("img").className).toMatch(/opacity-/);
    expect(card("Alpha").parentElement!.className).toMatch(/opacity-/);
  });
});

describe("NodePollerSection repeaters", () => {
  it("tags each row with its origin and role", async () => {
    mount(poller({ targets: [
      target(),
      target({ nodeId: "n-b", publicKey: key("b"), name: "Bravo", requested: true, role: "standby", rank: 2 }),
      target({ nodeId: "n-c", publicKey: key("c"), name: "Charlie", role: "unassigned", rank: null }),
    ] }));
    await screen.findByText("Alpha");
    expect(within(card("Alpha")).getByText("Own")).toBeInTheDocument();
    expect(within(card("Alpha")).getByText("Poller")).toBeInTheDocument();
    expect(within(card("Bravo")).getByText("Requested")).toBeInTheDocument();
    expect(within(card("Bravo")).getByText("Standby 2")).toBeInTheDocument();
    expect(within(card("Charlie")).getByText("Not assigned")).toBeInTheDocument();
  });

  it.each([
    ["ok", "Answering", "text-green"],
    ["pending", "Waiting for the first poll", "text-text-muted"],
    ["no_reply", "No reply, 3 in a row", "text-warn"],
    ["not_direct", "Not in direct range", "text-danger"],
    ["login_failed", "Login failed", "text-danger"],
    ["admin_stop", "Stopped: repeater gave admin access", "text-danger"],
    ["brand_new", "brand_new", "text-text-muted"],
  ])("labels the %s state", async (state, label, colour) => {
    mount(poller({ targets: [target({ state, misses: 3 })] }));
    expect((await screen.findByText(label)).closest("[data-state]")).toHaveClass(colour);
  });

  it("shows no state line for an empty state", async () => {
    mount(poller({ targets: [target({ state: "" })] }));
    await screen.findByText("Alpha");
    expect(card("Alpha").querySelector("[data-state]")).toBeNull();
  });

  it("shows the reply, signal, reading and what was heard", async () => {
    mount(poller());
    await screen.findByText("Alpha");
    const c = within(card("Alpha"));
    expect(c.getByText("Last reply").nextElementSibling).toHaveTextContent("2m ago");
    expect(c.getByText("SNR").nextElementSibling).toHaveTextContent("11.25");
    expect(c.getByText("Reading").nextElementSibling).toHaveTextContent("3m ago");
    expect(c.getByText("22 adverts heard, 10.40 dB")).toBeInTheDocument();
  });

  it("says never and no adverts when there is nothing yet", async () => {
    mount(poller({ targets: [target({ lastOk: null, latestReadingAt: null, claimedSnr: null, evidenceCount: 0, evidenceSnr: null })] }));
    await screen.findByText("Alpha");
    const c = within(card("Alpha"));
    expect(c.getAllByText("never")).toHaveLength(2);
    expect(c.getByText("No adverts heard from it")).toBeInTheDocument();
  });

  it("falls back to the key for a nameless repeater", async () => {
    mount(poller({ targets: [target({ name: null })] }));
    const name = await screen.findByText("5be1c07a");
    expect(name).toHaveClass("italic");
  });

  it("opens the node on click only when the repeater is a known node", async () => {
    const { onViewNode } = mount(poller({ targets: [target(), target({ nodeId: null, publicKey: key("b"), name: "Bravo" })] }));
    await screen.findByText("Alpha");
    fireEvent.click(card("Bravo"));
    expect(onViewNode).not.toHaveBeenCalled();
    expect(card("Bravo")).not.toHaveClass("cursor-pointer");
    fireEvent.click(card("Alpha"));
    expect(onViewNode).toHaveBeenCalledWith("n-a");
  });
});

describe("NodePollerSection states", () => {
  it("says so when the radio has no claim", async () => {
    mount({ claim: null, readings24h: 0, targets: [] });
    expect(await screen.findByText("This radio has no polling claim.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("says so when it polls nothing yet", async () => {
    mount(poller({ targets: [] }, { slots: { max: 8, used: 0, own: 0, requested: 0, free: 8 } }));
    expect(await screen.findByText("It polls no repeaters yet.")).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("shows loading, then an alert with a retry on failure", async () => {
    vi.mocked(getNodePoller).mockRejectedValueOnce({ status: 500 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><NodePollerSection nodeId="n-self" /></QueryClientProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the poller.");
    vi.mocked(getNodePoller).mockResolvedValue(poller());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
  });
});
