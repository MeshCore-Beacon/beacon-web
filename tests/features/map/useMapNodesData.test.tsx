import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMapNodesData } from "../../../src/features/map/useMapNodesData";
import { getNodesPage } from "../../../src/api/client";
import type { NodeSummary } from "../../../src/features/nodes/types";

vi.mock("../../../src/api/client", () => ({ getNodesPage: vi.fn() }));

const mockGetNodesPage = vi.mocked(getNodesPage);

function node(id: string): NodeSummary {
  return { id, publicKey: id, nodeType: 1, nodeTypeName: "repeater", name: id, lat: 0, lng: 0, iatas: [] };
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  mockGetNodesPage.mockReset();
});

describe("useMapNodesData", () => {
  it("auto-chains pages and concatenates every page's nodes", async () => {
    mockGetNodesPage
      .mockResolvedValueOnce({ items: [node("a"), node("b")], nextCursor: 2, hasMore: true })
      .mockResolvedValueOnce({ items: [node("c")], nextCursor: null, hasMore: false });

    const { result } = renderHook(() => useMapNodesData(["YYZ"], "YYZ"), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isPaging).toBe(false));

    expect(result.current.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(result.current.loadedCount).toBe(3);
    expect(mockGetNodesPage).toHaveBeenCalledTimes(2);
    // second call paginates with the previous page's nextCursor; the map always requests neighbor ids
    expect(mockGetNodesPage).toHaveBeenLastCalledWith(["YYZ"], { cursor: 2, neighbors: true });
  });

  it("stops after a single page when hasMore is false", async () => {
    mockGetNodesPage.mockResolvedValueOnce({ items: [node("a")], nextCursor: null, hasMore: false });

    const { result } = renderHook(() => useMapNodesData(undefined, "*"), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isPaging).toBe(false));
    expect(result.current.loadedCount).toBe(1);
    expect(mockGetNodesPage).toHaveBeenCalledTimes(1); // no over-fetch past the last page
  });

  it("stops chaining (no retry loop) when a page fetch fails", async () => {
    mockGetNodesPage
      .mockResolvedValueOnce({ items: [node("a")], nextCursor: 1, hasMore: true })
      .mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useMapNodesData(["YYZ"], "YYZ"), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // the failed page must not re-arm the auto-chain effect: exactly page 1 + one failed page 2
    expect(mockGetNodesPage).toHaveBeenCalledTimes(2);
    expect(result.current.isPaging).toBe(false); // pill hides on error instead of hanging on
    expect(result.current.nodes.map((n) => n.id)).toEqual(["a"]); // page 1 still shows
  });

  it("dedupes nodes that repeat across a page boundary (cursor is a non-unique timestamp)", async () => {
    mockGetNodesPage
      .mockResolvedValueOnce({ items: [node("a"), node("b")], nextCursor: 5, hasMore: true })
      .mockResolvedValueOnce({ items: [node("b"), node("c")], nextCursor: null, hasMore: false });

    const { result } = renderHook(() => useMapNodesData(["YYZ"], "YYZ"), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isPaging).toBe(false));
    expect(result.current.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]); // b not doubled
    expect(result.current.loadedCount).toBe(3);
  });
});
