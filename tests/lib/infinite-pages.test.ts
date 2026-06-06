import { describe, expect, it } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";
import { patchInfinitePages } from "../../src/lib/infinite-pages";
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
