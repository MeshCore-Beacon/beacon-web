import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AtlasPage } from "../../../src/features/atlas/AtlasPage";
import { ATLAS_KEY, NO_NODE_ID, loadAtlasNode } from "../../../src/features/atlas/atlas";
import * as api from "../../../src/api/client";
import { ApiError } from "../../../src/api/client";
import { me } from "../../../src/api/auth";
import * as session from "../../../src/hooks/useSession";
import type { User } from "../../../src/features/account/types";
import type { Node } from "../../../src/features/nodes/types";
import "../../../src/i18n";

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getNodesPage: vi.fn(), getNode: vi.fn(), getNodeActivity: vi.fn(), getPacketDetail: vi.fn(),
  getObserverDirectoryPage: vi.fn(), getObserver: vi.fn(), getObserverActivity: vi.fn(), getObserverTelemetry: vi.fn(),
}));
vi.mock("../../../src/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/auth")>()),
  me: { atlas: vi.fn(), putAtlas: vi.fn(), get: vi.fn() },
}));
vi.mock("../../../src/hooks/useSession");

const publicKey = "ab".repeat(32);
const id = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const found = { id, publicKey, name: "Hilltop", nodeType: 2, nodeTypeName: "REPEATER", knownNeighborCount: 1, stale: false, lastSeen: Date.now(), iatas: [], lat: null, lng: null } as Node;
const actions = { onViewNode: vi.fn(), onViewObserver: vi.fn(), onAnalyzePacket: vi.fn() };
let user: User | null;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AtlasPage {...actions} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  user = null;
  vi.mocked(session.useSession).mockImplementation(() => ({ user, loading: false, enabled: true, refresh: () => {} }));
  vi.mocked(api.getNodesPage).mockResolvedValue({ items: [found], hasMore: false, nextCursor: null });
  vi.mocked(api.getNode).mockResolvedValue(found);
  vi.mocked(api.getNodeActivity).mockRejectedValue(new ApiError(404, "not_found", "x"));
});
afterEach(() => localStorage.clear());

describe("Atlas page, signed out", () => {
  it("stores exactly what the page always stored and never calls the account", async () => {
    mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Find a node" }), { target: { value: "hill" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add Hilltop" }));
    fireEvent.click(screen.getByRole("button", { name: "3d" }));
    expect(localStorage.getItem(ATLAS_KEY)).toBe(JSON.stringify({ version: 2, range: "3d", pins: [{ kind: "node", id, publicKey, name: "Hilltop" }] }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(localStorage.getItem(ATLAS_KEY)).toBe(JSON.stringify({ version: 2, range: "3d", pins: [] }));
    expect(me.atlas).not.toHaveBeenCalled();
    expect(me.putAtlas).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByText("0 / 12 saved"));
    fireEvent.mouseEnter(screen.getByText("0 / 12 saved"));
    expect(await screen.findByText("Saved in this browser")).toBeTruthy();
  });
});

describe("Atlas page, signed in", () => {
  beforeEach(() => {
    user = { id: "u1" } as User;
    localStorage.setItem("beacon-atlas-synced:u1", "1");
  });

  it("shows a pin the server does not know as the existing not-found card", async () => {
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    vi.mocked(me.atlas).mockResolvedValue({ revision: 2, range: "24h", limit: 12, pins: [{ kind: "node", publicKey, id: null, name: "Gone", observerId: null }] });
    mount();
    expect(await screen.findByText("Node not found")).toBeTruthy();
    expect(api.getNode).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).pins[0].id).toBe(NO_NODE_ID);
  });

  it("says how many cards to remove when the server refuses an Atlas over its cap", async () => {
    const pin = (n: number) => ({ kind: "node" as const, publicKey: String(n).repeat(64), id: null, name: `R${n}`, observerId: null });
    vi.mocked(me.atlas).mockResolvedValue({ revision: 2, range: "24h", limit: 1, pins: [pin(1), pin(2), pin(3)] });
    vi.mocked(me.putAtlas).mockRejectedValue(new ApiError(422, "invalid_input", "at most 1 pins"));
    mount();
    const remove = await screen.findAllByRole("button", { name: "Remove" });
    fireEvent.click(remove[0]!);
    expect(await screen.findByText("This server allows 1 card. Remove 1 more to save your Atlas to your account.")).toBeTruthy();
  });

  it("an id recovered by a card stays on screen only: no write, no request", async () => {
    vi.mocked(me.atlas).mockResolvedValue({ revision: 2, range: "24h", limit: 12, pins: [{ kind: "node", publicKey, id: second, name: "Hilltop", observerId: null }] });
    vi.mocked(api.getNode).mockImplementation(async (nodeId) => {
      if (nodeId === second) throw new ApiError(404, "not_found", "x");
      return found;
    });
    mount();
    await screen.findByRole("button", { name: "Hilltop" });
    await waitFor(() => expect(api.getNode).toHaveBeenCalledWith(id, expect.anything()));
    await new Promise((r) => setTimeout(r, 20));
    expect(JSON.parse(localStorage.getItem(ATLAS_KEY)!).pins[0].id).toBe(second);
    expect(me.putAtlas).not.toHaveBeenCalled();
  });

  it("says the Atlas is synced to the account", async () => {
    vi.mocked(me.atlas).mockResolvedValue({ revision: 1, range: "24h", limit: 12, pins: [] });
    mount();
    const chip = await screen.findByText("0 / 12 saved");
    await waitFor(() => { fireEvent.mouseEnter(chip); expect(screen.getByText("Synced to your account")).toBeTruthy(); });
  });
});

describe("loadAtlasNode with no known id", () => {
  it("skips the by-id request and looks the key up", async () => {
    vi.mocked(api.getNodesPage).mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    await expect(loadAtlasNode({ kind: "node", id: NO_NODE_ID, publicKey, name: "x" })).rejects.toMatchObject({ status: 404 });
    expect(api.getNode).not.toHaveBeenCalled();
  });
});
