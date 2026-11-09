import type { InfiniteData } from "@tanstack/react-query";
import type { CursorPage } from "../types/api";

// Apply a per-page item patch to a paginated react-query cache (e.g. a WS live update), preserving
// references when nothing changed: an unchanged page keeps its object, and if no page changed the
// original `old` is returned so react-query skips the update (no needless re-render / map repaint).
// `patchItems` must return the SAME array reference when it makes no change (patchNodeSummary /
// patchObserverSummary already do).
export function patchInfinitePages<T>(
  old: InfiniteData<CursorPage<T>> | undefined,
  patchItems: (items: T[]) => T[],
): InfiniteData<CursorPage<T>> | undefined {
  if (!old) return old;
  let changed = false;
  const pages = old.pages.map((p) => {
    const items = patchItems(p.items);
    if (items === p.items) return p; // unchanged page keeps its reference
    changed = true;
    return { ...p, items };
  });
  return changed ? { ...old, pages } : old;
}

// Returns a flattener that remembers its last call: pages appended at the end (paging) add only
// their own items, and a page swapped for a patched copy (a live update) has just its changed items
// replaced, instead of re-walking every page. Items repeated across a page boundary (non-unique
// cursors) keep their first occurrence. getId must be stable.
export function createPageFlattener<T>(getId: (item: T) => string): (pages: readonly CursorPage<T, unknown>[] | undefined) => T[] {
  let done: readonly CursorPage<T, unknown>[] = [];
  let slots: number[][] = []; // per page, each item's position in items, or -1 for a repeat
  let items: T[] = [];
  let seen = new Set<string>();

  // swaps in a patched page's items; false when it changed shape (then everything is rebuilt)
  const patch = (next: T[], before: CursorPage<T, unknown>, after: CursorPage<T, unknown>, at: number[]) => {
    if (before.items.length !== after.items.length) return false;
    for (let j = 0; j < after.items.length; j++) {
      const was = before.items[j]!;
      const now = after.items[j]!;
      if (was === now) continue;
      if (getId(was) !== getId(now)) return false;
      if (at[j]! >= 0) next[at[j]!] = now;
    }
    return true;
  };

  return (pages = []) => {
    let keep = Math.min(done.length, pages.length);
    if (pages.length < done.length) keep = 0;
    let next: T[] | undefined;
    for (let i = 0; i < keep; i++) {
      if (pages[i] === done[i]) continue;
      next ??= items.slice();
      if (!patch(next, done[i]!, pages[i]!, slots[i]!)) {
        keep = 0;
        break;
      }
    }
    if (keep === 0 && done.length > 0) {
      next = [];
      slots = [];
      seen = new Set();
    } else if (pages.length === keep) {
      if (next) {
        done = pages.slice();
        items = next;
      }
      return items;
    }
    next ??= items.slice();
    for (const page of pages.slice(keep)) {
      const at: number[] = [];
      for (const item of page.items) {
        const id = getId(item);
        if (seen.has(id)) {
          at.push(-1);
          continue;
        }
        seen.add(id);
        at.push(next.length);
        next.push(item);
      }
      slots.push(at);
    }
    done = pages.slice();
    items = next;
    return items;
  };
}
