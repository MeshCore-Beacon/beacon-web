import { describe, expect, it } from "vitest";
import { createIncrementalSort, type Compare } from "../../src/lib/incremental-sort";

interface Row {
  id: number;
  key: string | null;
}

// the DataTable shape: empties sink, text compares numerically, few distinct keys so ties are common
const collator = new Intl.Collator(undefined, { numeric: true });
const byKey = (dir: 1 | -1): Compare<Row> => (a, b) => {
  const aEmpty = a.key == null;
  const bEmpty = b.key == null;
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  return collator.compare(a.key!, b.key!) * dir;
};

function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

const keys = ["b", "a", "node 10", "node 9", "Ölm", "zed", null];
let nextId = 0;
const makeRow = (r: () => number): Row => ({ id: nextId++, key: keys[Math.floor(r() * keys.length)] });

describe("createIncrementalSort", () => {
  it("matches a full stable sort through pages and live patches, ties included", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = rng(seed);
      const sort = createIncrementalSort<Row>();
      const compare = byKey(seed % 2 ? 1 : -1);
      let rows: Row[] = [];
      for (let step = 0; step < 60; step++) {
        rows = rows.slice();
        if (r() < 0.6 || rows.length === 0) {
          for (let n = Math.floor(r() * 30); n > 0; n--) rows.push(makeRow(r)); // a page lands
        } else {
          for (let n = 1 + Math.floor(r() * 3); n > 0; n--) {
            const i = Math.floor(r() * rows.length);
            rows[i] = r() < 0.5 ? { ...rows[i] } : { ...rows[i], key: makeRow(r).key }; // a WS patch
          }
        }
        expect(sort(rows, compare)).toEqual(rows.slice().sort(compare));
      }
    }
  });

  it("returns the same array for the same rows and comparator", () => {
    const sort = createIncrementalSort<Row>();
    const compare = byKey(1);
    const rows = [{ id: 1, key: "b" }, { id: 2, key: "a" }];
    expect(sort(rows, compare)).toBe(sort(rows, compare));
  });

  it("returns a new array when rows change, leaving the previous result untouched", () => {
    const sort = createIncrementalSort<Row>();
    const compare = byKey(1);
    const rows = [{ id: 1, key: "b" }, { id: 2, key: "a" }];
    const first = sort(rows, compare);
    const second = sort([...rows, { id: 3, key: "0" }], compare);
    expect(first.map((row) => row.id)).toEqual([2, 1]);
    expect(second.map((row) => row.id)).toEqual([3, 2, 1]);
  });

  it("re-sorts fully for a new comparator, a shrink, a reorder or a repeated row", () => {
    const sort = createIncrementalSort<Row>();
    const a = { id: 1, key: "a" };
    const b = { id: 2, key: "b" };
    const c = { id: 3, key: "c" };
    expect(sort([a, b, c], byKey(1))).toEqual([a, b, c]);
    expect(sort([a, b, c], byKey(-1))).toEqual([c, b, a]);
    expect(sort([c, a], byKey(-1))).toEqual([c, a]);
    expect(sort([a, c], byKey(-1))).toEqual([c, a]);
    expect(sort([a, c, a], byKey(-1))).toEqual([c, a, a]);
    expect(sort([a, c, a, b], byKey(-1))).toEqual([c, b, a, a]);
  });

  it("keeps a patched row's place among equal keys, as a full sort would", () => {
    const sort = createIncrementalSort<Row>();
    const compare = byKey(1);
    const rows = [{ id: 1, key: "x" }, { id: 2, key: "x" }, { id: 3, key: "x" }];
    sort(rows, compare);
    const patched = [rows[0], { id: 2, key: "x" }, rows[2]];
    expect(sort(patched, compare).map((row) => row.id)).toEqual([1, 2, 3]);
    const moved = [patched[0], { id: 2, key: "a" }, patched[2]];
    expect(sort(moved, compare).map((row) => row.id)).toEqual([2, 1, 3]);
  });
});
