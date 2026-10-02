import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RegionProvider, useRegion } from "../../src/hooks/useRegion";
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
