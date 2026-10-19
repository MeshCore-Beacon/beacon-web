import type { CursorPage, PageParam } from "../types/api";

// Both cursors go back so a server that ignores pageCursor (2.0.x, or a rollback) still advances by cursor.
export function nextPageParam<C>(last: CursorPage<unknown, C>): PageParam<C> | undefined {
  if (last.hasMore !== true) return undefined;
  const next: PageParam<C> = {};
  if (last.nextCursor != null) next.cursor = last.nextCursor;
  if (typeof last.nextPageCursor === "string" && last.nextPageCursor !== "") next.pageCursor = last.nextPageCursor;
  return next.cursor === undefined && next.pageCursor === undefined ? undefined : next;
}
