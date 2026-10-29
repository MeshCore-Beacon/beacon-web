// A stable sort that reuses its previous result when the rows only grew at the end or swapped a few
// items in place (paging, live patches), so a 78k-row list isn't re-sorted from scratch every time.

export type Compare<T> = (a: T, b: T) => number;

// more in-place swaps than this and a full sort is cheaper than patching one by one
const MAX_PATCHES = 64;

interface SortState<T> {
  rows: readonly T[];
  compare: Compare<T>;
  sorted: T[];
  // each row's position in rows: the tie-breaker that makes the result match a full stable sort;
  // undefined when rows repeat an item, which turns the incremental path off
  index?: Map<T, number>;
}

// first position in sorted[from..] that doesn't sort before item
function lowerBound<T>(sorted: readonly T[], item: T, compare: Compare<T>, from = 0): number {
  let lo = from;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compare(sorted[mid]!, item) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function fullSort<T>(rows: readonly T[], compare: Compare<T>): SortState<T> {
  const index = new Map<T, number>();
  rows.forEach((row, i) => index.set(row, i));
  return { rows, compare, sorted: rows.slice().sort(compare), index: index.size === rows.length ? index : undefined };
}

function update<T>(prev: SortState<T>, rows: readonly T[]): SortState<T> | undefined {
  const { index } = prev;
  if (!index || rows.length < prev.rows.length) return undefined;
  const patched: number[] = [];
  for (let i = 0; i < prev.rows.length; i++) {
    if (rows[i] !== prev.rows[i] && patched.push(i) > MAX_PATCHES) return undefined;
  }
  // the index is updated in place; prev is never reused after this, whatever the outcome
  const byPosition = (a: T, b: T) => prev.compare(a, b) || index.get(a)! - index.get(b)!;
  let sorted = prev.sorted;
  if (patched.length > 0) {
    sorted = sorted.slice();
    for (const i of patched) {
      const old = prev.rows[i]!;
      const next = rows[i]!;
      if (index.has(next)) return undefined; // moved, not replaced
      const at = lowerBound(sorted, old, byPosition);
      if (sorted[at] !== old) return undefined;
      index.delete(old);
      index.set(next, i);
      if (prev.compare(old, next) === 0) {
        sorted[at] = next;
      } else {
        sorted.splice(at, 1);
        sorted.splice(lowerBound(sorted, next, byPosition), 0, next);
      }
    }
  }
  if (rows.length > prev.rows.length) {
    for (let i = prev.rows.length; i < rows.length; i++) {
      const row = rows[i]!;
      if (index.has(row)) return undefined;
      index.set(row, i);
    }
    const tail = rows.slice(prev.rows.length).sort(byPosition);
    const merged = new Array<T>(sorted.length + tail.length);
    let from = 0;
    let k = 0;
    for (const item of tail) {
      const at = lowerBound(sorted, item, byPosition, from);
      while (from < at) merged[k++] = sorted[from++]!;
      merged[k++] = item;
    }
    while (from < sorted.length) merged[k++] = sorted[from++]!;
    sorted = merged;
  }
  return { rows, compare: prev.compare, sorted, index };
}

// Returns a sorter that remembers its last call. Same order as rows.slice().sort(compare); a new
// compare (another column or direction) starts over with a full sort.
export function createIncrementalSort<T>(): (rows: readonly T[], compare: Compare<T>) => T[] {
  let state: SortState<T> | undefined;
  return (rows, compare) => {
    if (state?.rows === rows && state.compare === compare) return state.sorted;
    state = (state?.compare === compare ? update(state, rows) : undefined) ?? fullSort(rows, compare);
    return state.sorted;
  };
}
