import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { me } from "../../../src/api/auth";
import * as api from "../../../src/api/client";
import { OWNER_KEY, syncedMarker, type ServerAtlas } from "../../../src/features/atlas/atlasSync";
import { ATLAS_KEY, withView, type SavedAtlas } from "../../../src/features/atlas/atlas";
import { useSyncedAtlas } from "../../../src/features/atlas/useSyncedAtlas";
import * as session from "../../../src/hooks/useSession";
import type { User } from "../../../src/features/account/types";
import "../../../src/i18n";

vi.mock("../../../src/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/auth")>()),
  me: { atlas: vi.fn(), putAtlas: vi.fn(), get: vi.fn() },
}));
vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getServerInfo: vi.fn(),
}));
vi.mock("../../../src/hooks/useSession");

const key = "ab".repeat(32);
const id = "11111111-1111-4111-8111-111111111111";
const serverPin = { kind: "node" as const, publicKey: key, id, name: "R1", observerId: null };
const doc = (pins: ServerAtlas["pins"], revision = 1): ServerAtlas => ({ revision, range: "24h", limit: 12, pins });
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const pinPoller = (v: SavedAtlas): SavedAtlas => ({ ...v, pins: v.pins.map((p) => (p.kind === "node" ? withView(p, "poller") : p)) });

async function ready(atlasPoller: boolean) {
  vi.mocked(api.getServerInfo).mockResolvedValue({ features: { atlasPoller } } as never);
  localStorage.setItem(syncedMarker("user-1"), "1");
  vi.mocked(me.atlas).mockResolvedValue(doc([serverPin], 5));
  const hook = renderHook(() => useSyncedAtlas(), { wrapper });
  await waitFor(() => expect(hook.result.current.synced).toBe(true));
  await waitFor(() => expect(api.getServerInfo).toHaveBeenCalled());
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return hook;
}

let current: User | null;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  current = { id: "user-1" } as User;
  vi.mocked(session.useSession).mockImplementation(() => ({ user: current, loading: false, enabled: true, refresh: () => {} }));
  vi.mocked(me.putAtlas).mockImplementation(async (body) => doc(body.pins.map((p) => ({ observerId: null, id, ...p })) as never, body.baseRevision + 1));
});

describe("A pinned Poller tab in a synced Atlas", () => {
  it("is sent when the server has atlasPoller", async () => {
    const { result } = await ready(true);
    act(() => result.current.update(pinPoller));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(vi.mocked(me.putAtlas).mock.calls[0]![0].pins[0]).toMatchObject({ view: "poller" });
  });

  it("is left out of the PUT on an older server and stays in this browser's copy, with no notice", async () => {
    const { result } = await ready(false);
    act(() => result.current.update(pinPoller));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(vi.mocked(me.putAtlas).mock.calls[0]![0].pins[0]).not.toHaveProperty("view");
    await waitFor(() => expect(result.current.saved.pins[0]).toMatchObject({ view: "poller" }));
    expect(localStorage.getItem("beacon-atlas-v2")).toContain('"view":"poller"');
    expect(result.current.notice).toBeNull();
  });
});

describe("another account on a server without atlasPoller", () => {
  it("does not inherit the first account's pinned Poller tab on a node both have", async () => {
    const { result, rerender } = await ready(false);
    act(() => result.current.update(pinPoller));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.saved.pins[0]).toMatchObject({ view: "poller" }));
    expect(localStorage.getItem(OWNER_KEY)).toBe("user-1");
    current = null;
    rerender();
    await waitFor(() => expect(result.current.synced).toBe(false));
    // The second account has the same node, saved with no view.
    vi.mocked(me.atlas).mockResolvedValue(doc([serverPin], 2));
    current = { id: "user-2" } as User;
    rerender();
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(result.current.saved.pins).toHaveLength(1);
    expect(result.current.saved.pins[0]).not.toHaveProperty("view", "poller");
    expect(localStorage.getItem(ATLAS_KEY)).not.toContain("poller");
    expect(localStorage.getItem(OWNER_KEY)).toBe("user-2");
    expect(me.putAtlas).toHaveBeenCalledTimes(1);
  });

  it("gives the first account its own Poller tab back from its own copy", async () => {
    const { result, rerender } = await ready(false);
    act(() => result.current.update(pinPoller));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.saved.pins[0]).toMatchObject({ view: "poller" }));
    current = null;
    rerender();
    await waitFor(() => expect(result.current.synced).toBe(false));
    current = { id: "user-1" } as User;
    rerender();
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(result.current.saved.pins[0]).toMatchObject({ view: "poller" });
  });
});

describe("a local Poller view while /info is still out", () => {
  const local = () => {
    localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 2, range: "24h", pins: [{ kind: "node", id, publicKey: key, name: "R1", view: "poller" }] }));
    localStorage.setItem(OWNER_KEY, "user-1");
    localStorage.setItem(syncedMarker("user-1"), "1");
  };
  const pendingInfo = () => {
    let answer: (value: unknown) => void = () => {};
    vi.mocked(api.getServerInfo).mockReturnValue(new Promise((resolve) => { answer = resolve; }) as never);
    return (atlasPoller: boolean) => act(async () => { answer({ features: { atlasPoller } }); });
  };

  it("does not override the account: the adoption waits for the flags, then the account's view wins", async () => {
    local();
    const answer = pendingInfo();
    vi.mocked(me.atlas).mockResolvedValue(doc([serverPin], 5));
    const { result } = renderHook(() => useSyncedAtlas(), { wrapper });
    await waitFor(() => expect(me.atlas).toHaveBeenCalled());
    await settle();
    expect(result.current.synced).toBe(false);
    await answer(true);
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(result.current.saved.pins[0]).not.toHaveProperty("view", "poller");
    expect(localStorage.getItem(ATLAS_KEY)).not.toContain("poller");
    expect(me.putAtlas).not.toHaveBeenCalled();
  });

  it("stays in this browser's copy once the server turns out not to store it", async () => {
    local();
    const answer = pendingInfo();
    vi.mocked(me.atlas).mockResolvedValue(doc([serverPin], 5));
    const { result } = renderHook(() => useSyncedAtlas(), { wrapper });
    await waitFor(() => expect(me.atlas).toHaveBeenCalled());
    await answer(false);
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(result.current.saved.pins[0]).toMatchObject({ view: "poller" });
  });

  it("holds a change made meanwhile and sends it once the flags are in", async () => {
    local();
    const answer = pendingInfo();
    vi.mocked(me.atlas).mockResolvedValue(doc([{ ...serverPin, view: "poller" }], 5));
    const { result } = renderHook(() => useSyncedAtlas(), { wrapper });
    await waitFor(() => expect(me.atlas).toHaveBeenCalled());
    act(() => result.current.update((v) => ({ ...v, range: "3d" })));
    await settle();
    expect(me.putAtlas).not.toHaveBeenCalled();
    await answer(true);
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(vi.mocked(me.putAtlas).mock.calls[0]![0]).toMatchObject({ baseRevision: 5, range: "3d", pins: [{ view: "poller" }] });
  });
});
