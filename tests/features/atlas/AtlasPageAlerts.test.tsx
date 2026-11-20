import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AtlasPage } from "../../../src/features/atlas/AtlasPage";
import type { ServerAtlas } from "../../../src/features/atlas/atlasSync";
import * as api from "../../../src/api/client";
import { ApiError } from "../../../src/api/client";
import { alerts, me } from "../../../src/api/auth";
import * as session from "../../../src/hooks/useSession";
import type { AlertTarget, User } from "../../../src/features/account/types";
import type { Node } from "../../../src/features/nodes/types";
import "../../../src/i18n";

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getNodesPage: vi.fn(), getNode: vi.fn(), getNodeActivity: vi.fn(), getPacketDetail: vi.fn(), getServerInfo: vi.fn(),
  getObserverDirectoryPage: vi.fn(), getObserver: vi.fn(), getObserverActivity: vi.fn(), getObserverTelemetry: vi.fn(),
}));
vi.mock("../../../src/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/auth")>()),
  me: { atlas: vi.fn(), putAtlas: vi.fn(), get: vi.fn() },
  alerts: { get: vi.fn(), putRule: vi.fn(), deleteRule: vi.fn(), putChannels: vi.fn() },
}));
vi.mock("../../../src/hooks/useSession", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/hooks/useSession")>()),
  useSession: vi.fn(),
}));

const publicKey = "ab".repeat(32);
const id = "11111111-1111-4111-8111-111111111111";
const found = { id, publicKey, name: "Hilltop", nodeType: 2, nodeTypeName: "REPEATER", knownNeighborCount: 1, stale: false, lastSeen: Date.now(), iatas: [], lat: null, lng: null } as Node;
const actions = { onViewNode: vi.fn(), onViewObserver: vi.fn(), onAnalyzePacket: vi.fn() };
const user = { id: "u1" } as User;
const target = (over: Partial<AlertTarget> = {}): AlertTarget => ({
  id, kind: "node", publicKey, name: "Hilltop", polled: false, available: ["gone_quiet", "back_online"], unavailable: {}, unavailableCodes: {}, rules: [], ...over,
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><AtlasPage {...actions} /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("beacon-atlas-synced:u1", "1");
  vi.mocked(session.useSession).mockImplementation(() => ({ user, loading: false, enabled: true, refresh: () => {} }));
  vi.mocked(api.getServerInfo).mockResolvedValue({ features: { accounts: "local", alerts: true } } as never);
  vi.mocked(api.getNodesPage).mockResolvedValue({ items: [found], hasMore: false, nextCursor: null });
  vi.mocked(api.getNode).mockResolvedValue(found);
  vi.mocked(api.getNodeActivity).mockRejectedValue(new ApiError(404, "not_found", "x"));
});
afterEach(() => localStorage.clear());

describe("Atlas page alerts", () => {
  it("makes a new pin's alerts editable once its Atlas save lands, though alerts were answered before it", async () => {
    vi.mocked(me.atlas).mockResolvedValue({ revision: 1, range: "24h", limit: 12, pins: [] });
    vi.mocked(alerts.get).mockResolvedValue({ targets: [] });
    let land: (doc: ServerAtlas) => void = () => {};
    vi.mocked(me.putAtlas).mockImplementation(() => new Promise((resolve) => { land = resolve; }));
    mount();
    fireEvent.change(screen.getByRole("textbox", { name: "Find a node" }), { target: { value: "hill" } });
    fireEvent.click(await screen.findByRole("button", { name: "Add Hilltop" }));
    const bell = await screen.findByRole("button", { name: "Alerts" });
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalled());
    await waitFor(() => expect(alerts.get).toHaveBeenCalledTimes(1));
    vi.mocked(alerts.get).mockResolvedValue({ targets: [target()] });
    land({ revision: 2, range: "24h", limit: 12, pins: [{ kind: "node", publicKey, id, name: "Hilltop", observerId: null }] });
    await waitFor(() => expect(alerts.get).toHaveBeenCalledTimes(2));
    fireEvent.click(bell);
    const dialog = within(await screen.findByRole("dialog", { name: "Alerts for Hilltop" }));
    expect(await dialog.findAllByRole("switch")).toHaveLength(2);
    expect(dialog.queryByText(/not available for this radio yet/)).not.toBeInTheDocument();
  });

  it("hands a lost observer's key from the sync to its card, so its rules still show", async () => {
    const lostKey = "9f".repeat(32);
    vi.mocked(me.atlas).mockResolvedValue({ revision: 4, range: "24h", limit: 12, pins: [{ kind: "observer", observerPublicKey: lostKey, observerId: null, name: "Lost listener" }] });
    vi.mocked(api.getObserver).mockRejectedValue(new ApiError(404, "not_found", "x"));
    vi.mocked(alerts.get).mockResolvedValue({ targets: [target({ id: null, kind: "observer", publicKey: lostKey, name: "Lost listener", available: ["observer_offline"],
      rules: [{ id: "r1", kind: "observer_offline", threshold: 60, thresholdHigh: null, enabled: true, state: "ok", stateChangedAt: 1, lastSentAt: null }] })] });
    mount();
    expect(await screen.findByRole("button", { name: "Alerts: 1 on" })).toBeInTheDocument();
  });
});
