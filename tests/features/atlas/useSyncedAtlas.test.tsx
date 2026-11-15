import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthError, me } from "../../../src/api/auth";
import { ATLAS_KEY, type SavedAtlas } from "../../../src/features/atlas/atlas";
import { OWNER_KEY, placeholderObserverId, syncedMarker, type ServerAtlas } from "../../../src/features/atlas/atlasSync";
import { useSyncedAtlas } from "../../../src/features/atlas/useSyncedAtlas";
import { useSavedAtlas } from "../../../src/features/atlas/useSavedAtlas";
import * as session from "../../../src/hooks/useSession";
import type { User } from "../../../src/features/account/types";
import "../../../src/i18n";

vi.mock("../../../src/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/auth")>()),
  me: { atlas: vi.fn(), putAtlas: vi.fn(), get: vi.fn() },
}));
vi.mock("../../../src/hooks/useSession");

const key = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
const user = { id: "user-1" } as User;
const nodePin = (n: number) => ({ kind: "node" as const, id: uuid(n), publicKey: key(n), name: `N${n}` });
const saved = (pins: SavedAtlas["pins"], range: "24h" | "3d" = "24h"): SavedAtlas => ({ version: 2, range, pins });
const serverNode = (n: number, id: string | null = uuid(n)) => ({ kind: "node" as const, publicKey: key(n), id, name: `N${n}`, observerId: null });
const document = (pins: ServerAtlas["pins"], revision = 1, range: "24h" | "3d" = "24h"): ServerAtlas => ({ revision, range, limit: 12, pins });
const cached = () => localStorage.getItem(ATLAS_KEY);
const putBodies = () => vi.mocked(me.putAtlas).mock.calls.map((c) => c[0]);

let current: User | null;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}
const mount = () => renderHook(() => useSyncedAtlas(), { wrapper });
const names = (pins: SavedAtlas["pins"]) => pins.map((p) => p.name);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  current = user;
  vi.mocked(session.useSession).mockImplementation(() => ({ user: current, loading: false, enabled: true, refresh: () => {} }));
  vi.mocked(me.atlas).mockResolvedValue(document([]));
  vi.mocked(me.putAtlas).mockImplementation(async (body) => document(body.pins as never, body.baseRevision + 1, body.range));
});
afterEach(() => localStorage.clear());

describe("signed out", () => {
  it("writes exactly what the local hook writes and never calls the server", () => {
    current = null;
    const steps = (hook: { update: (c: (v: SavedAtlas) => SavedAtlas) => void }) => {
      act(() => hook.update((v) => ({ ...v, pins: [...v.pins, nodePin(1)] })));
      act(() => hook.update((v) => ({ ...v, pins: [...v.pins, nodePin(2), { kind: "observer", observerId: uuid(9), name: "O", tiles: ["uptime", "battery", "types", "noise"] }] })));
      act(() => hook.update((v) => ({ ...v, range: "3d" })));
      act(() => hook.update((v) => ({ ...v, pins: [v.pins[2]!, v.pins[0]!, v.pins[1]!] })));
      act(() => hook.update((v) => ({ ...v, pins: v.pins.filter((p) => p.name !== "N1") })));
    };
    const old = renderHook(() => useSavedAtlas(), { wrapper });
    steps(old.result.current);
    const expected = cached();
    old.unmount();
    localStorage.clear();
    const next = mount();
    steps(next.result.current);
    expect(cached()).toBe(expected);
    expect(expected).toBe(JSON.stringify({ version: 2, range: "3d", pins: [
      { kind: "observer", observerId: uuid(9), name: "O", tiles: ["uptime", "battery", "types", "noise"] },
      nodePin(2),
    ] }));
    expect(me.atlas).not.toHaveBeenCalled();
    expect(me.putAtlas).not.toHaveBeenCalled();
    expect(next.result.current.synced).toBe(false);
  });

  it("adjust writes locally like update", () => {
    current = null;
    localStorage.setItem(ATLAS_KEY, JSON.stringify(saved([nodePin(1)])));
    const { result } = mount();
    act(() => result.current.adjust((v) => ({ ...v, pins: [{ ...nodePin(1), id: uuid(7) }] })));
    expect(JSON.parse(cached()!).pins[0].id).toBe(uuid(7));
  });
});

describe("first sign-in", () => {
  it("uploads the local Atlas when the server is empty, then marks the device", async () => {
    localStorage.setItem(ATLAS_KEY, JSON.stringify(saved([nodePin(1), nodePin(2)], "3d")));
    vi.mocked(me.atlas).mockResolvedValue(document([], 0));
    const { result } = mount();
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(putBodies()[0]).toEqual({ baseRevision: 0, range: "3d", pins: [
      { kind: "node", publicKey: key(1), name: "N1" }, { kind: "node", publicKey: key(2), name: "N2" },
    ] });
    await waitFor(() => expect(localStorage.getItem(syncedMarker("user-1"))).not.toBeNull());
    expect(result.current.synced).toBe(true);
    expect(names(result.current.saved.pins)).toEqual(["N1", "N2"]);
  });

  it("merges server pins first, then local ones, and says how many did not fit", async () => {
    const server = Array.from({ length: 11 }, (_, i) => serverNode(i + 1));
    vi.mocked(me.atlas).mockResolvedValue(document(server, 4));
    localStorage.setItem(ATLAS_KEY, JSON.stringify(saved([nodePin(50), nodePin(51), nodePin(3)])));
    const { result } = mount();
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    const body = putBodies()[0]!;
    expect(body.baseRevision).toBe(4);
    expect(body.pins).toHaveLength(12);
    expect((body.pins[11] as { publicKey: string }).publicKey).toBe(key(50));
    await waitFor(() => expect(result.current.notice).toBe("1 card from this device did not fit in your account Atlas."));
  });

  it("uses the server Atlas without a request when only it has pins", async () => {
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(1)], 2, "3d"));
    const { result } = mount();
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(me.putAtlas).not.toHaveBeenCalled();
    expect(result.current.saved).toEqual(saved([nodePin(1)], "3d"));
    expect(cached()).toBe(JSON.stringify(saved([nodePin(1)], "3d")));
    expect(localStorage.getItem(syncedMarker("user-1"))).not.toBeNull();
  });

  it("does not merge again once the marker is set: the server copy wins", async () => {
    localStorage.setItem(syncedMarker("user-1"), "1");
    localStorage.setItem(ATLAS_KEY, JSON.stringify(saved([nodePin(1)])));
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(2)], 6));
    const { result } = mount();
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(me.putAtlas).not.toHaveBeenCalled();
    expect(names(result.current.saved.pins)).toEqual(["N2"]);
  });

  it("keeps the marker unset when the first upload fails, so it merges next time", async () => {
    localStorage.setItem(ATLAS_KEY, JSON.stringify(saved([nodePin(1)])));
    vi.mocked(me.putAtlas).mockRejectedValue(new AuthError(503, "read_only", "no"));
    const { result } = mount();
    await waitFor(() => expect(result.current.notice).toMatch(/Could not save/));
    expect(localStorage.getItem(syncedMarker("user-1"))).toBeNull();
    expect(names(result.current.saved.pins)).toEqual(["N1"]);
  });

  it("shows the device copy and a line when the account Atlas cannot be read", async () => {
    localStorage.setItem(ATLAS_KEY, JSON.stringify(saved([nodePin(1)])));
    vi.mocked(me.atlas).mockRejectedValue(new AuthError(500, "boom", "x"));
    const { result } = mount();
    await waitFor(() => expect(result.current.notice).toMatch(/Could not load/));
    expect(result.current.synced).toBe(false);
    expect(names(result.current.saved.pins)).toEqual(["N1"]);
  });
});

describe("signed in", () => {
  async function ready(pins: ServerAtlas["pins"] = [serverNode(1)], revision = 5) {
    localStorage.setItem(syncedMarker("user-1"), "1");
    vi.mocked(me.atlas).mockResolvedValue(document(pins, revision));
    const hook = mount();
    await waitFor(() => expect(hook.result.current.synced).toBe(true));
    return hook;
  }

  it("sends one PUT per change with the last revision and caches the answer", async () => {
    const { result } = await ready();
    act(() => result.current.update((v) => ({ ...v, range: "3d" })));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(putBodies()[0]).toMatchObject({ baseRevision: 5, range: "3d" });
    await waitFor(() => expect(cached()).toContain('"range":"3d"'));
    act(() => result.current.update((v) => ({ ...v, range: "24h" })));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(2));
    expect(putBodies()[1]!.baseRevision).toBe(6);
  });

  it("queues quick changes: the next PUT waits for the answer and carries the latest everything", async () => {
    const { result } = await ready();
    let release!: (d: ServerAtlas) => void;
    vi.mocked(me.putAtlas).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    act(() => result.current.update((v) => ({ ...v, pins: [...v.pins, nodePin(2)] })));
    act(() => result.current.update((v) => ({ ...v, pins: [...v.pins, nodePin(3)] })));
    act(() => result.current.update((v) => ({ ...v, range: "3d" })));
    await Promise.resolve();
    expect(me.putAtlas).toHaveBeenCalledTimes(1);
    await act(async () => release(document([serverNode(1), serverNode(2)], 6)));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(2));
    const second = putBodies()[1]!;
    expect(second.baseRevision).toBe(6);
    expect(second.range).toBe("3d");
    expect(second.pins.map((p) => (p as { publicKey: string }).publicKey)).toEqual([key(1), key(2), key(3)]);
    // the screen kept the queued change while the first answer was applied
    expect(names(result.current.saved.pins)).toEqual(["N1", "N2", "N3"]);
  });

  it("adopts the current document on a conflict, drops the change, says so and does not retry", async () => {
    const { result } = await ready();
    vi.mocked(me.putAtlas).mockRejectedValueOnce(new AuthError(409, "atlas_conflict", "changed", undefined, {
      error: { code: "atlas_conflict", message: "changed" }, current: document([serverNode(7)], 9, "3d"),
    }));
    act(() => result.current.update((v) => ({ ...v, pins: [...v.pins, nodePin(2)] })));
    await waitFor(() => expect(result.current.notice).toBe("Atlas was changed on another device. Showing the latest."));
    expect(result.current.saved).toEqual(saved([nodePin(7)], "3d"));
    expect(cached()).toBe(JSON.stringify(saved([nodePin(7)], "3d")));
    expect(me.putAtlas).toHaveBeenCalledTimes(1);
    act(() => result.current.update((v) => ({ ...v, range: "24h" })));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(2));
    expect(putBodies()[1]!.baseRevision).toBe(9);
    expect(result.current.notice).toBeNull();
  });

  it("makes no request and no local write for an automatic rewrite", async () => {
    const { result } = await ready();
    const before = cached();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    act(() => result.current.adjust((v) => ({ ...v, pins: [{ ...nodePin(1), id: uuid(42) }] })));
    expect(result.current.saved.pins[0]).toMatchObject({ id: uuid(42) });
    expect(writes).not.toHaveBeenCalled();
    expect(cached()).toBe(before);
    await new Promise((r) => setTimeout(r, 20));
    expect(me.putAtlas).not.toHaveBeenCalled();
    writes.mockRestore();
  });

  it("keeps a pin for a node the server does not know and sends only its key back", async () => {
    const { result } = await ready([serverNode(1, null)]);
    expect(result.current.saved.pins[0]).toMatchObject({ kind: "node", publicKey: key(1) });
    act(() => result.current.update((v) => ({ ...v, range: "3d" })));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalled());
    expect(putBodies()[0]!.pins[0]).toEqual({ kind: "node", publicKey: key(1), name: "N1" });
  });

  it("sends an observer the server could not resolve by its key", async () => {
    const { result } = await ready([{ kind: "observer", observerPublicKey: key(4), observerId: null, name: "Gone" }]);
    act(() => result.current.update((v) => ({ ...v, range: "3d" })));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalled());
    expect(putBodies()[0]!.pins[0]).toEqual({ kind: "observer", observerPublicKey: key(4), name: "Gone" });
    expect(placeholderObserverId(key(4))).toMatch(/^00000000/);
  });

  it("sends an import as one change", async () => {
    const { result } = await ready();
    act(() => result.current.update(() => saved([nodePin(8), nodePin(9)], "3d")));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(putBodies()[0]!.pins).toHaveLength(2);
  });

  it("keeps the collection on screen and in storage after sign out, and stops syncing", async () => {
    const { result, rerender } = await ready([serverNode(1), serverNode(2)]);
    current = null;
    rerender();
    await waitFor(() => expect(result.current.synced).toBe(false));
    expect(names(result.current.saved.pins)).toEqual(["N1", "N2"]);
    expect(names(JSON.parse(cached()!).pins)).toEqual(["N1", "N2"]);
    expect(localStorage.getItem(syncedMarker("user-1"))).not.toBeNull();
    act(() => result.current.update((v) => ({ ...v, range: "3d" })));
    await new Promise((r) => setTimeout(r, 20));
    expect(me.putAtlas).not.toHaveBeenCalled();
  });

  it("signing back in does not merge again", async () => {
    const { result, rerender } = await ready([serverNode(1)]);
    current = null;
    rerender();
    act(() => result.current.update((v) => ({ ...v, pins: [...v.pins, nodePin(2)] })));
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(1)], 5));
    current = user;
    rerender();
    await waitFor(() => expect(names(result.current.saved.pins)).toEqual(["N1"]));
    expect(me.putAtlas).not.toHaveBeenCalled();
  });
});

describe("another account on the same browser", () => {
  const userB = { id: "user-2" } as User;

  it("never uploads the previous account's pins and shows the new account's Atlas", async () => {
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(1), serverNode(2)], 3));
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(localStorage.getItem(OWNER_KEY)).toBe("user-1");
    current = null;
    rerender();
    await waitFor(() => expect(result.current.synced).toBe(false));
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(7)], 1));
    current = userB;
    rerender();
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(me.putAtlas).not.toHaveBeenCalled();
    expect(names(result.current.saved.pins)).toEqual(["N7"]);
    expect(names(JSON.parse(cached()!).pins)).toEqual(["N7"]);
    expect(localStorage.getItem(OWNER_KEY)).toBe("user-2");
  });

  it("does not upload the previous account's pins to an empty account either", async () => {
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(1)], 3));
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.synced).toBe(true));
    current = null;
    rerender();
    vi.mocked(me.atlas).mockResolvedValue(document([], 0));
    current = userB;
    rerender();
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(me.putAtlas).not.toHaveBeenCalled();
    expect(result.current.saved.pins).toEqual([]);
  });

  it("the first account signing back in still gets its own Atlas", async () => {
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(1)], 3));
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.synced).toBe(true));
    current = null;
    rerender();
    act(() => result.current.update((v) => ({ ...v, pins: [...v.pins, nodePin(2)] })));
    expect(localStorage.getItem(OWNER_KEY)).toBe("user-1");
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(1)], 3));
    current = user;
    rerender();
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(names(result.current.saved.pins)).toEqual(["N1"]);
    expect(me.putAtlas).not.toHaveBeenCalled();
  });

  it("is not synced again until the new sign-in has loaded", async () => {
    const { result, rerender } = mount();
    await waitFor(() => expect(result.current.synced).toBe(true));
    current = null;
    rerender();
    let release!: (d: ServerAtlas) => void;
    vi.mocked(me.atlas).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    current = user;
    rerender();
    expect(result.current.synced).toBe(false);
    await act(async () => release(document([serverNode(1)], 3)));
    await waitFor(() => expect(result.current.synced).toBe(true));
    expect(names(result.current.saved.pins)).toEqual(["N1"]);
  });

  it("a never-synced local Atlas still merges and then belongs to the account", async () => {
    localStorage.setItem(ATLAS_KEY, JSON.stringify(saved([nodePin(1)])));
    const { result } = mount();
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem(OWNER_KEY)).toBe("user-1"));
    expect(result.current.saved.pins).toHaveLength(1);
  });
});

describe("a change made while the first load is in flight", () => {
  const slowLoad = () => {
    let release!: (d: ServerAtlas) => void;
    vi.mocked(me.atlas).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    return (d: ServerAtlas) => act(async () => release(d));
  };

  it("holds an added card, then sends one write on the loaded and merged revision", async () => {
    localStorage.setItem(ATLAS_KEY, JSON.stringify(saved([nodePin(1)])));
    const release = slowLoad();
    const { result } = mount();
    act(() => result.current.update((v) => ({ ...v, pins: [...v.pins, nodePin(3)] })));
    await new Promise((r) => setTimeout(r, 20));
    expect(me.putAtlas).not.toHaveBeenCalled();
    await release(document([serverNode(2)], 8));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(putBodies()[0]!.baseRevision).toBe(8);
    expect(putBodies()[0]!.pins.map((p) => (p as { publicKey: string }).publicKey)).toEqual([key(2), key(1), key(3)]);
  });

  it("holds a removed card: it stays removed and the loaded cards stay", async () => {
    localStorage.setItem(syncedMarker("user-1"), "1");
    localStorage.setItem(OWNER_KEY, "user-1");
    localStorage.setItem(ATLAS_KEY, JSON.stringify(saved([nodePin(1), nodePin(2)])));
    const release = slowLoad();
    const { result } = mount();
    act(() => result.current.update((v) => ({ ...v, pins: v.pins.filter((p) => p.name !== "N1") })));
    await release(document([serverNode(1), serverNode(2), serverNode(3)], 4));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(putBodies()[0]!.baseRevision).toBe(4);
    expect(putBodies()[0]!.pins.map((p) => (p as { publicKey: string }).publicKey)).toEqual([key(2), key(3)]);
    await waitFor(() => expect(names(result.current.saved.pins)).toEqual(["N2", "N3"]));
  });

  it("a removal on a first sign-in is not undone by the merge", async () => {
    localStorage.setItem(ATLAS_KEY, JSON.stringify(saved([nodePin(1), nodePin(2)])));
    const release = slowLoad();
    const { result } = mount();
    act(() => result.current.update((v) => ({ ...v, pins: v.pins.filter((p) => p.name !== "N1") })));
    await release(document([serverNode(1)], 2));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(putBodies()[0]!.pins.map((p) => (p as { publicKey: string }).publicKey)).toEqual([key(2)]);
  });
});

describe("the conflict answer", () => {
  it("reads current from the top level of the body without refetching", async () => {
    localStorage.setItem(syncedMarker("user-1"), "1");
    localStorage.setItem(OWNER_KEY, "user-1");
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(1)], 5));
    const { result } = mount();
    await waitFor(() => expect(result.current.synced).toBe(true));
    vi.mocked(me.putAtlas).mockRejectedValueOnce(new AuthError(409, "atlas_conflict", "changed", undefined, {
      error: { code: "atlas_conflict", message: "changed" }, current: document([serverNode(7)], 9),
    }));
    act(() => result.current.update((v) => ({ ...v, range: "3d" })));
    await waitFor(() => expect(names(result.current.saved.pins)).toEqual(["N7"]));
    expect(me.atlas).toHaveBeenCalledTimes(1);
  });

  it("refetches when the body carries no document", async () => {
    localStorage.setItem(syncedMarker("user-1"), "1");
    localStorage.setItem(OWNER_KEY, "user-1");
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(1)], 5));
    const { result } = mount();
    await waitFor(() => expect(result.current.synced).toBe(true));
    vi.mocked(me.atlas).mockResolvedValue(document([serverNode(8)], 9));
    vi.mocked(me.putAtlas).mockRejectedValueOnce(new AuthError(409, "atlas_conflict", "changed", undefined, { error: { code: "atlas_conflict", message: "changed" } }));
    act(() => result.current.update((v) => ({ ...v, range: "3d" })));
    await waitFor(() => expect(names(result.current.saved.pins)).toEqual(["N8"]));
  });
});
