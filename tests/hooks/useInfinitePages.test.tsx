import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useInfinitePages } from "../../src/hooks/useInfinitePages";

interface Row {
  id: string;
}
const row = (id: string): Row => ({ id });
const rowId = (r: Row) => r.id;

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useInfinitePages", () => {
  it("auto-chains pages, concatenates items, and forwards the prev page's nextCursor", async () => {
    const queryFn = vi.fn();
    queryFn
      .mockResolvedValueOnce({ items: [row("a"), row("b")], nextCursor: 2, hasMore: true })
      .mockResolvedValueOnce({ items: [row("c")], nextCursor: null, hasMore: false });

    const { result } = renderHook(
      () => useInfinitePages({ queryKey: ["t", 1], queryFn, getId: rowId }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isPaging).toBe(false));
    expect(result.current.items.map(rowId)).toEqual(["a", "b", "c"]);
    expect(result.current.loadedCount).toBe(3);
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(queryFn).toHaveBeenNthCalledWith(1, undefined); // first page sends no cursor
    expect(queryFn).toHaveBeenNthCalledWith(2, 2); // second page uses page 1's nextCursor
  });

  it("dedupes items repeated across a page boundary (cursor is a non-unique timestamp)", async () => {
    const queryFn = vi.fn();
    queryFn
      .mockResolvedValueOnce({ items: [row("a"), row("b")], nextCursor: 5, hasMore: true })
      .mockResolvedValueOnce({ items: [row("b"), row("c")], nextCursor: null, hasMore: false });

    const { result } = renderHook(
      () => useInfinitePages({ queryKey: ["t", 2], queryFn, getId: rowId }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isPaging).toBe(false));
    expect(result.current.items.map(rowId)).toEqual(["a", "b", "c"]); // b not doubled
  });

  it("stops without looping when a page fetch fails", async () => {
    const queryFn = vi.fn();
    queryFn
      .mockResolvedValueOnce({ items: [row("a")], nextCursor: 1, hasMore: true })
      .mockRejectedValue(new Error("boom"));

    const { result } = renderHook(
      () => useInfinitePages({ queryKey: ["t", 3], queryFn, getId: rowId }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryFn).toHaveBeenCalledTimes(2); // page 1 + one failed page 2, no retry loop
    expect(result.current.isPaging).toBe(false);
    expect(result.current.items.map(rowId)).toEqual(["a"]); // page 1 still shows
  });

  it("with auto:false, loads only the first page until loadMore is called", async () => {
    const queryFn = vi.fn();
    queryFn
      .mockResolvedValueOnce({ items: [row("a"), row("b")], nextCursor: 2, hasMore: true })
      .mockResolvedValueOnce({ items: [row("c")], nextCursor: null, hasMore: false });

    const { result } = renderHook(
      () => useInfinitePages({ queryKey: ["t", "ondemand"], queryFn, getId: rowId, auto: false }),
      { wrapper: wrapper() },
    );

    // first page lands, but the hook does NOT chain to page 2 on its own
    await waitFor(() => expect(result.current.items.map(rowId)).toEqual(["a", "b"]));
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isPaging).toBe(false); // idle, not "loading forever" despite hasMore

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.items.map(rowId)).toEqual(["a", "b", "c"]));
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(queryFn).toHaveBeenNthCalledWith(2, 2); // loadMore used page 1's nextCursor
    expect(result.current.hasMore).toBe(false);
  });

  it("keeps previous items (no skeleton) while a new key loads when keepPrevious is set", async () => {
    const queryFn = vi.fn();
    queryFn.mockResolvedValueOnce({ items: [row("a")], nextCursor: null, hasMore: false }); // key A

    const { result, rerender } = renderHook(
      ({ k }: { k: string }) =>
        useInfinitePages({ queryKey: ["kp", k], queryFn, getId: rowId, keepPrevious: true }),
      { wrapper: wrapper(), initialProps: { k: "A" } },
    );

    await waitFor(() => expect(result.current.items.map(rowId)).toEqual(["a"]));

    // key B: hold the first page in-flight so we can observe the transition (a filter change)
    let resolveB!: (p: { items: Row[]; nextCursor: number | null; hasMore: boolean }) => void;
    queryFn.mockImplementationOnce(
      () => new Promise<{ items: Row[]; nextCursor: number | null; hasMore: boolean }>((res) => { resolveB = res; }),
    );
    rerender({ k: "B" });

    // while B loads, A's rows stay visible (placeholderData) and isLoading stays false (no skeleton flash)
    await waitFor(() => expect(result.current.isPaging).toBe(true));
    expect(result.current.items.map(rowId)).toEqual(["a"]);
    expect(result.current.isLoading).toBe(false);

    resolveB({ items: [row("b")], nextCursor: null, hasMore: false });
    await waitFor(() => expect(result.current.items.map(rowId)).toEqual(["b"])); // new data replaces old
  });
});
