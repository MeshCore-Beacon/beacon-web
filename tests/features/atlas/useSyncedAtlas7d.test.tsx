import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { me } from "../../../src/api/auth";
import * as api from "../../../src/api/client";
import { syncedMarker, type ServerAtlas } from "../../../src/features/atlas/atlasSync";
import { ATLAS_KEY, type AtlasRange, type SavedAtlas } from "../../../src/features/atlas/atlas";
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
const doc = (range: AtlasRange, revision = 1): ServerAtlas => ({ revision, range, limit: 12, pins: [serverPin] });
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const rename = (v: SavedAtlas): SavedAtlas => ({ ...v, pins: v.pins.map((p) => ({ ...p, name: "Renamed" })) });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const storedRange = () => JSON.parse(localStorage.getItem(ATLAS_KEY)!).range;

async function ready(atlas7d: boolean, server: AtlasRange) {
  vi.mocked(api.getServerInfo).mockResolvedValue({ features: { atlas7d } } as never);
  localStorage.setItem(syncedMarker("user-1"), "1");
  vi.mocked(me.atlas).mockResolvedValue(doc(server, 5));
  const hook = renderHook(() => useSyncedAtlas(), { wrapper });
  await waitFor(() => expect(hook.result.current.synced).toBe(true));
  await waitFor(() => expect(api.getServerInfo).toHaveBeenCalled());
  await settle();
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(session.useSession).mockImplementation(() => ({ user: { id: "user-1" } as User, loading: false, enabled: true, refresh: () => {} }));
  // The server stores and answers the range it was sent.
  vi.mocked(me.putAtlas).mockImplementation(async (body) => doc(body.range, body.baseRevision + 1));
});

describe("A 7d range in a synced Atlas", () => {
  it("is sent as 7d when the server has atlas7d", async () => {
    const { result } = await ready(true, "24h");
    act(() => result.current.update((v) => ({ ...v, range: "7d" })));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(vi.mocked(me.putAtlas).mock.calls[0]![0].range).toBe("7d");
    await settle();
    expect(result.current.saved.range).toBe("7d");
  });

  it("goes out as 3d on an older server and stays 7d in this browser's copy, with no notice", async () => {
    localStorage.setItem(ATLAS_KEY, JSON.stringify({ version: 2, range: "7d", pins: [{ kind: "node", id, publicKey: key, name: "R1" }] }));
    const { result } = await ready(false, "3d");
    expect(result.current.saved.range).toBe("7d");
    act(() => result.current.update(rename));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(vi.mocked(me.putAtlas).mock.calls[0]![0].range).toBe("3d");
    await settle();
    expect(result.current.saved.range).toBe("7d");
    expect(storedRange()).toBe("7d");
    expect(result.current.notice).toBeNull();
  });

  it("holds a 7d write until /info has answered, then sends it as the server allows", async () => {
    let answer: (value: unknown) => void = () => {};
    vi.mocked(api.getServerInfo).mockReturnValue(new Promise((resolve) => { answer = resolve; }) as never);
    localStorage.setItem(syncedMarker("user-1"), "1");
    vi.mocked(me.atlas).mockResolvedValue(doc("7d", 5));
    const { result } = renderHook(() => useSyncedAtlas(), { wrapper });
    await waitFor(() => expect(me.atlas).toHaveBeenCalled());
    act(() => result.current.update(rename));
    await settle();
    // The account document is not adopted before the flags are in, so nothing is written either.
    expect(result.current.synced).toBe(false);
    expect(me.putAtlas).not.toHaveBeenCalled();
    await act(async () => { answer({ features: { atlas7d: true } }); });
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(vi.mocked(me.putAtlas).mock.calls[0]![0].range).toBe("7d");
    expect(result.current.saved.range).toBe("7d");
  });
});
