import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { me } from "../../../src/api/auth";
import * as api from "../../../src/api/client";
import { syncedMarker, type ServerAtlas } from "../../../src/features/atlas/atlasSync";
import { withTelemetryTiles, withView, type NodePin, type SavedAtlas } from "../../../src/features/atlas/atlas";
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
const pin: NodePin = { kind: "node", id, publicKey: key, name: "R1" };
const serverPin = { kind: "node" as const, publicKey: key, id, name: "R1", observerId: null };
const doc = (pins: ServerAtlas["pins"], revision = 1): ServerAtlas => ({ revision, range: "24h", limit: 12, pins });
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const TILES = ["packets", "signal", "errors", "battery"] as const;
const edit = (v: SavedAtlas): SavedAtlas => ({ ...v, pins: v.pins.map((p) => (p.kind === "node" ? withTelemetryTiles(withView(p, "telemetry"), TILES) : p)) });

async function ready(atlasTelemetry: boolean) {
  vi.mocked(api.getServerInfo).mockResolvedValue({ features: { atlasTelemetry } } as never);
  localStorage.setItem(syncedMarker("user-1"), "1");
  vi.mocked(me.atlas).mockResolvedValue(doc([serverPin], 5));
  const hook = renderHook(() => useSyncedAtlas(), { wrapper });
  await waitFor(() => expect(hook.result.current.synced).toBe(true));
  // /info answers on its own clock; the flag is read at send time
  await waitFor(() => expect(api.getServerInfo).toHaveBeenCalled());
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(session.useSession).mockImplementation(() => ({ user: { id: "user-1" } as User, loading: false, enabled: true, refresh: () => {} }));
  vi.mocked(me.putAtlas).mockImplementation(async (body) => doc(body.pins.map((p) => ({ observerId: null, id, ...p })) as never, body.baseRevision + 1));
});

describe("Telemetry fields in a synced Atlas", () => {
  it("are sent when the server has atlasTelemetry", async () => {
    const { result } = await ready(true);
    act(() => result.current.update(edit));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    expect(vi.mocked(me.putAtlas).mock.calls[0]![0].pins[0]).toMatchObject({ view: "telemetry", telemetryTiles: [...TILES] });
  });

  it("are left out of the PUT on an older server, and stay in this browser's copy, with no notice", async () => {
    const { result } = await ready(false);
    act(() => result.current.update(edit));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(me.putAtlas).mock.calls[0]![0].pins[0]!;
    expect(sent).not.toHaveProperty("view");
    expect(sent).not.toHaveProperty("telemetryTiles");
    await waitFor(() => expect(result.current.saved.pins[0]).toMatchObject({ view: "telemetry", telemetryTiles: [...TILES] }));
    expect(localStorage.getItem("beacon-atlas-v2")).toContain('"view":"telemetry"');
    expect(result.current.notice).toBeNull();
  });

  it("are not stripped on a later change that touches something else", async () => {
    const { result } = await ready(false);
    act(() => result.current.update(edit));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(1));
    act(() => result.current.update((v) => ({ ...v, range: "3d" })));
    await waitFor(() => expect(me.putAtlas).toHaveBeenCalledTimes(2));
    expect(result.current.saved.pins[0]).toMatchObject({ view: "telemetry" });
    expect(pin.view).toBeUndefined();
  });
});
