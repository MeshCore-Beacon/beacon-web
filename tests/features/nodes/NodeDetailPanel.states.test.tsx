import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { NodeDetailPanel } from "../../../src/features/nodes/NodeDetailPanel";
import i18n from "../../../src/i18n";
import type { Node } from "../../../src/features/nodes/types";

vi.mock("../../../src/hooks/useFeatures", () => ({ useFeatures: () => ({ polling: false, accounts: "off" }) }));
vi.mock("../../../src/hooks/useTelemetryRequests", () => ({ useRequestsAvailable: () => false }));

const node: Node = { id: "a", publicKey: "aa", name: "Node A", nodeType: 2, nodeTypeName: "repeater", lat: null, lng: null, iatas: [], locationSource: null, lastAdvertAt: null, supportsMultibytePaths: false, supportsMultibyteTraces: false, minFirmwareVersion: null, firstSeen: 1, lastSeen: 2, metadata: null };
const emptyObservations = { items: [], nextCursor: null, hasMore: false };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = (status = 500) => response({ error: { code: status === 404 ? "not_found" : "server_error", message: "controlled failure" } }, status);
type Endpoint = "node" | "neighbors" | "observations";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const replies: Record<Endpoint, () => Promise<Response>> = {
    node: async () => response(node), neighbors: async () => response([]), observations: async () => response(emptyObservations),
  };
  const calls = { node: 0, neighbors: 0, observations: 0 };
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const path = new URL(url).pathname;
    const endpoint = path.endsWith("/neighbors") ? "neighbors" : path.endsWith("/observations") ? "observations" : path.endsWith("/nodes/a") ? "node" : null;
    if (!endpoint) throw new Error(`Unexpected request: ${url}`);
    calls[endpoint]++;
    return replies[endpoint]();
  }));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
  const mount = () => render(<NodeDetailPanel nodeId="a" onClose={() => {}} onViewObserver={() => {}} />, { wrapper });
  return { client, replies, calls, mount };
}
const section = (key: string) => within(screen.getByText(i18n.t(key)).closest("details")!);
const openSections = () => {
  for (const key of ["nodeDetail.neighbors", "nodeDetail.recentPackets"]) {
    const summary = screen.getByText(i18n.t(key)).closest("summary")!;
    if (!summary.closest("details")!.open) fireEvent.click(summary);
  }
};
const retry = (key: string) => screen.getByRole("button", { name: i18n.t("nodeDetail.retrySection", { section: i18n.t(key) }) });

beforeEach(async () => { await i18n.changeLanguage("en"); });
afterEach(() => vi.unstubAllGlobals());

describe("node detail query states", () => {
  it("keeps an initially offline query pending instead of showing an empty or missing panel", async () => {
    const { client, calls, mount } = setup();
    onlineManager.setOnline(false);
    const view = mount();
    try {
      await waitFor(() => expect(client.getQueryState(["node", "a"])?.fetchStatus).toBe("paused"));
      expect(screen.getByText(i18n.t("common.loadingDots"))).toBeInTheDocument();
      expect(screen.queryByText(i18n.t("nodeDetail.notFound"))).not.toBeInTheDocument();
      expect(calls).toEqual({ node: 0, neighbors: 0, observations: 0 });
    } finally {
      view.unmount();
      onlineManager.setOnline(true);
    }
  });

  it.each(["server", "network"])("does not call a %s failure a missing node and retries only its detail read", async (kind) => {
    const { client, replies, calls, mount } = setup();
    replies.node = kind === "server" ? async () => failure() : async () => { throw new TypeError("Failed to fetch"); };
    mount();
    await waitFor(() => expect(client.getQueryState(["node", "a"])?.status).toBe("error"));
    expect(screen.queryByText(i18n.t("nodeDetail.notFound"))).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("common.loadFailed"));
    replies.node = async () => response(node);
    fireEvent.click(retry("nodeDetail.title"));
    expect(await screen.findByText("Node A")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(calls).toEqual({ node: 2, neighbors: 1, observations: 1 });
  });

  it("keeps an authoritative 404 distinct from a retryable load failure", async () => {
    const { replies, mount } = setup();
    replies.node = async () => failure(404);
    mount();
    expect(await screen.findByText(i18n.t("nodeDetail.notFound"))).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Node A")).not.toBeInTheDocument();
  });

  it("shows pending subsections before reporting successful empty results", async () => {
    const { replies, mount } = setup();
    let finishNeighbors!: (value: Response) => void, finishObservations!: (value: Response) => void;
    replies.neighbors = () => new Promise((resolve) => { finishNeighbors = resolve; });
    replies.observations = () => new Promise((resolve) => { finishObservations = resolve; });
    mount();
    await screen.findByText("Node A");
    openSections();
    expect(screen.queryByText(i18n.t("nodeDetail.noNeighbors"))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t("nodeDetail.noRecentPackets"))).not.toBeInTheDocument();
    expect(section("nodeDetail.neighbors").getByRole("status")).toHaveTextContent(i18n.t("common.loading"));
    expect(section("nodeDetail.recentPackets").getByRole("status")).toHaveTextContent(i18n.t("common.loading"));
    finishNeighbors(response([]));
    finishObservations(response(emptyObservations));
    expect(await screen.findByText(i18n.t("nodeDetail.noNeighbors"))).toBeInTheDocument();
    expect(await screen.findByText(i18n.t("nodeDetail.noRecentPackets"))).toBeInTheDocument();
  });

  it("reports failed subsections honestly and retries each one without reloading its siblings", async () => {
    const { replies, calls, mount } = setup();
    replies.neighbors = replies.observations = async () => failure();
    mount();
    await screen.findByText("Node A");
    openSections();
    expect(await screen.findAllByRole("alert")).toHaveLength(2);
    expect(screen.queryByText(i18n.t("nodeDetail.noNeighbors"))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t("nodeDetail.noRecentPackets"))).not.toBeInTheDocument();
    replies.neighbors = async () => response([]);
    fireEvent.click(retry("nodeDetail.neighbors"));
    expect(await screen.findByText(i18n.t("nodeDetail.noNeighbors"))).toBeInTheDocument();
    expect(calls).toEqual({ node: 1, neighbors: 2, observations: 1 });
    replies.observations = async () => response(emptyObservations);
    fireEvent.click(retry("nodeDetail.recentPackets"));
    expect(await screen.findByText(i18n.t("nodeDetail.noRecentPackets"))).toBeInTheDocument();
    expect(calls).toEqual({ node: 1, neighbors: 2, observations: 2 });
  });

  it("keeps cached rows visible after refetch failures and marks them as previously loaded", async () => {
    const { client, replies, mount } = setup();
    const old = { updatedAt: Date.now() - 60_000 };
    client.setQueryData(["node", "a"], { ...node, name: "Cached node" }, old);
    client.setQueryData(["node-neighbors", "a"], [{ id: "b", name: "Cached neighbor", publicKey: "bb", nodeTypeName: "repeater", nodeType: 2, iata: "YKF", observationCount: 1, firstSeen: 1, lastSeen: 2 }], old);
    client.setQueryData(["node-observations", "a"], { ...emptyObservations, items: [{ id: 1, packetHash: "packet-a", payloadTypeName: "ADVERT", iata: "YKF", heardAt: 2, snr: 10, rssi: -80, hopCount: 1 }] }, old);
    replies.node = replies.neighbors = replies.observations = async () => failure();
    mount();
    await screen.findByText("Cached node");
    openSections();
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(3));
    expect(screen.getByText("Cached node")).toBeInTheDocument();
    expect(screen.getByText("Cached neighbor")).toBeInTheDocument();
    expect(screen.getByText("ADVERT")).toBeInTheDocument();
    expect(screen.getAllByText(i18n.t("nodeDetail.previousData"))).toHaveLength(3);
    expect(screen.queryByText(i18n.t("nodeDetail.noNeighbors"))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t("nodeDetail.noRecentPackets"))).not.toBeInTheDocument();
  });

  it("does not treat cached empty subsections as a successful current refresh", async () => {
    const { client, replies, mount } = setup();
    const old = { updatedAt: Date.now() - 60_000 };
    client.setQueryData(["node-neighbors", "a"], [], old);
    client.setQueryData(["node-observations", "a"], emptyObservations, old);
    replies.neighbors = replies.observations = async () => failure();
    mount();
    await screen.findByText("Node A");
    openSections();
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    expect(screen.queryByText(i18n.t("nodeDetail.noNeighbors"))).not.toBeInTheDocument();
    expect(screen.queryByText(i18n.t("nodeDetail.noRecentPackets"))).not.toBeInTheDocument();
  });

  it("replaces a cached node with the missing state after a confirmed 404", async () => {
    const { client, replies, mount } = setup();
    client.setQueryData(["node", "a"], node, { updatedAt: Date.now() - 60_000 });
    replies.node = async () => failure(404);
    mount();
    expect(await screen.findByText(i18n.t("nodeDetail.notFound"))).toBeInTheDocument();
    expect(screen.queryByText("Node A")).not.toBeInTheDocument();
  });

  it.each(["fr", "sv"])("localizes the retry action in %s", async (language) => {
    await i18n.changeLanguage(language);
    const { replies, mount } = setup();
    replies.node = async () => failure();
    const view = mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("common.loadFailed"));
    expect(retry("nodeDetail.title")).toHaveTextContent(language === "fr" ? "Réessayer" : "Försök igen");
    view.unmount();
  });
});
