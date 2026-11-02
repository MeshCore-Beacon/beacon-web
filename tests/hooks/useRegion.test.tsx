import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RegionProvider, useRegion, REGIONS_CACHE_KEY } from "../../src/hooks/useRegion";
import { shouldRetryQuery } from "../../src/api/rate-limit";

const getRegions = vi.fn();
const getRegion = vi.fn();
vi.mock("../../src/api/client", () => ({
  getRegions: () => getRegions(),
  getRegion: (id: number) => getRegion(id),
}));

const notFound = Object.assign(new Error("region not found"), { status: 404 });

function setup(regions: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <RegionProvider defaultSelection={{ regions, iatas: [] }}>{children}</RegionProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useRegion(), { wrapper });
}

beforeEach(() => {
  getRegions.mockReset();
  getRegion.mockReset();
  getRegions.mockResolvedValue([{ id: 1, slug: "west", name: "West" }, { id: 2, slug: "gone", name: "Gone" }]);
});

describe("useRegion", () => {
  it("resolves every region from the list alone when the server lists their IATAs", async () => {
    getRegions.mockResolvedValue([
      { id: 1, slug: "west", name: "West", iatas: ["YVR", "YYJ"] },
      { id: 2, slug: "empty", name: "Empty", iatas: [] },
    ]);
    const { result } = setup(["west"]);

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.iatas).toEqual(["YVR", "YYJ"]);
    expect(getRegions).toHaveBeenCalledTimes(1);
    expect(getRegion).not.toHaveBeenCalled();
  });

  it("fetches each region when an older server lists them without IATAs", async () => {
    getRegion.mockImplementation((id: number) => Promise.resolve({ id, slug: id === 1 ? "west" : "gone", name: "x", iatas: [`Y0${id}`] }));
    const { result } = setup(["west"]);

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.iatas).toEqual(["Y01"]);
    expect(getRegion).toHaveBeenCalledTimes(2);
  });

  // the list and detail are cached separately server-side, so a listed region can 404 on its detail
  it("still resolves when one region's detail is missing", async () => {
    getRegion.mockImplementation((id: number) =>
      id === 1 ? Promise.resolve({ id: 1, slug: "west", name: "West", iatas: ["YVR"] }) : Promise.reject(notFound));
    const { result } = setup(["west"]);

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.iatas).toEqual(["YVR"]);
  });

  it("treats a selected region whose detail 404s like any other unknown slug", async () => {
    getRegion.mockImplementation((id: number) =>
      id === 1 ? Promise.resolve({ id: 1, slug: "west", name: "West", iatas: ["YVR"] }) : Promise.reject(notFound));
    const { result } = setup(["gone"]);

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.regionKey).toBe("*");
  });
});

describe("useRegion's stored region list", () => {
  const stored = [{ id: 1, slug: "west", name: "West", iatas: ["YVR"] }];

  it("resolves a returning visitor's region from the stored list before the server answers", async () => {
    localStorage.setItem(REGIONS_CACHE_KEY, JSON.stringify(stored));
    let answer!: (v: unknown) => void;
    getRegions.mockReturnValue(new Promise((r) => { answer = r; }));
    const { result } = setup(["west"]);

    expect(result.current.isResolved).toBe(true);
    expect(result.current.iatas).toEqual(["YVR"]);
    expect(getRegions).toHaveBeenCalledTimes(1); // still asked, every load

    await act(async () => answer([{ id: 1, slug: "west", name: "West", iatas: ["YVR", "YYJ"] }]));
    await waitFor(() => expect(result.current.iatas).toEqual(["YVR", "YYJ"]));
    expect(JSON.parse(localStorage.getItem(REGIONS_CACHE_KEY)!)[0].iatas).toEqual(["YVR", "YYJ"]);
  });

  it("stores the list it fetched", async () => {
    getRegions.mockResolvedValue(stored);
    const { result } = setup(["west"]);
    await waitFor(() => expect(result.current.isResolved).toBe(true));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(REGIONS_CACHE_KEY) ?? "null")).toEqual(stored));
  });

  it("ignores a stored list it can't read", async () => {
    localStorage.setItem(REGIONS_CACHE_KEY, JSON.stringify([{ slug: "west" }]));
    getRegions.mockReturnValue(new Promise(() => {}));
    const { result } = setup(["west"]);
    expect(result.current.isResolved).toBe(false);
  });
});
