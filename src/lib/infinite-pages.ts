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
