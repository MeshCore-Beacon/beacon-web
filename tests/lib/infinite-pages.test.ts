import { describe, expect, it } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";
import { createPageFlattener, patchInfinitePages } from "../../src/lib/infinite-pages";
import type { CursorPage } from "../../src/types/api";

interface Row {
  id: string;
  v: number;
}

const page = (items: Row[], nextCursor: number | null, hasMore: boolean): CursorPage<Row> => ({
  items,
  nextCursor,
  hasMore,
});

const data = (pages: CursorPage<Row>[]): InfiniteData<CursorPage<Row>> => ({
  pages,
  pageParams: pages.map(() => undefined),
});

// per-page patch: bump v of the row with id "x"; return the SAME ref when "x" is absent
function bumpX(items: Row[]): Row[] {
  const i = items.findIndex((r) => r.id === "x");
  if (i === -1) return items;
  const next = [...items];
  next[i] = { ...next[i]!, v: next[i]!.v + 1 };
  return next;
}

describe("patchInfinitePages", () => {
  it("returns undefined when there is no data", () => {
    expect(patchInfinitePages(undefined, bumpX)).toBeUndefined();
  });

  it("returns the SAME object when no page changed (so React Query skips the update)", () => {
    const d = data([page([{ id: "a", v: 1 }], 1, true), page([{ id: "b", v: 1 }], null, false)]);
    expect(patchInfinitePages(d, bumpX)).toBe(d);
  });

  it("patches only the page holding the item and preserves the other page's reference", () => {
    const p0 = page([{ id: "x", v: 1 }], 1, true);
    const p1 = page([{ id: "b", v: 1 }], null, false);
    const d = data([p0, p1]);

    const out = patchInfinitePages(d, bumpX)!;

    expect(out).not.toBe(d);
    expect(out.pages[0]).not.toBe(p0);
    expect(out.pages[0]!.items[0]!.v).toBe(2);
    expect(out.pages[1]).toBe(p1); // unchanged page keeps its reference
    expect(out.pageParams).toBe(d.pageParams); // pageParams untouched
  });
});

describe("createPageFlattener", () => {
  const ids = (rows: Row[]) => rows.map((r) => r.id);

  it("appends only the new pages' items, keeping the first of a repeated id", () => {
    const flatten = createPageFlattener<Row>((r) => r.id);
    const p1 = page([{ id: "a", v: 1 }, { id: "b", v: 1 }], 2, true);
    const p2 = page([{ id: "b", v: 2 }, { id: "c", v: 1 }], null, false);
    const first = flatten([p1]);
    const second = flatten([p1, p2]);
    expect(ids(first)).toEqual(["a", "b"]);
    expect(ids(second)).toEqual(["a", "b", "c"]);
    expect(second[1].v).toBe(1);
    expect(second[0]).toBe(first[0]);
    expect(flatten([p1, p2])).toBe(second);
  });

  it("swaps in a patched page's changed items, also while new pages land", () => {
    const flatten = createPageFlattener<Row>((r) => r.id);
    const p1 = page([{ id: "a", v: 1 }, { id: "b", v: 1 }], 1, true);
    const p2 = page([{ id: "b", v: 2 }, { id: "c", v: 1 }], 2, true);
    const before = flatten([p1, p2]);
    const patched2 = page([{ id: "b", v: 3 }, { id: "c", v: 9 }], 2, true); // b repeats p1's, so stays hidden
    const after = flatten([p1, patched2]);
    expect(after).not.toBe(before);
    expect(after.map((r) => [r.id, r.v])).toEqual([["a", 1], ["b", 1], ["c", 9]]);
    expect(after[0]).toBe(before[0]);
    const p3 = page([{ id: "d", v: 1 }], null, false);
    const patched1 = page([{ id: "a", v: 5 }, p1.items[1]!], 1, true);
    expect(flatten([patched1, patched2, p3]).map((r) => [r.id, r.v])).toEqual([["a", 5], ["b", 1], ["c", 9], ["d", 1]]);
  });

  it("rebuilds when a page changes shape or pages go away", () => {
    const flatten = createPageFlattener<Row>((r) => r.id);
    const p1 = page([{ id: "a", v: 1 }], 1, true);
    const p2 = page([{ id: "b", v: 1 }], null, false);
    flatten([p1, p2]);
    expect(ids(flatten([page([{ id: "x", v: 1 }, { id: "a", v: 1 }], 1, true), p2]))).toEqual(["x", "a", "b"]);
    expect(ids(flatten([page([{ id: "y", v: 1 }], 1, true), p2]))).toEqual(["y", "b"]);
    expect(ids(flatten([p2]))).toEqual(["b"]);
    expect(flatten(undefined)).toEqual([]);
  });
});
