import type { CursorPage, PageParam } from "../types/api";

// Both cursors go back so a server that ignores pageCursor (2.0.x, or a rollback) still advances by cursor.
export function nextPageParam<C>(last: CursorPage<unknown, C>): PageParam<C> | undefined {
  if (last.hasMore !== true) return undefined;
  const next: PageParam<C> = {};
  if (last.nextCursor != null) next.cursor = last.nextCursor;
  if (typeof last.nextPageCursor === "string" && last.nextPageCursor !== "") next.pageCursor = last.nextPageCursor;
  return next.cursor === undefined && next.pageCursor === undefined ? undefined : next;
}

// A server that rejects our echoed pageCursor (400 "invalid pageCursor") gets one more try by cursor
// alone. Without a cursor that would restart at page 1, so the error stands.
export async function fetchPage<C, R>(page: PageParam<C> | undefined, fetch: (page: PageParam<C> | undefined) => Promise<R>): Promise<R> {
  try {
    return await fetch(page);
  } catch (error) {
    const e = error as { status?: unknown; message?: unknown } | null;
    if (e?.status !== 400 || e.message !== "invalid pageCursor" || page?.pageCursor === undefined || page.cursor === undefined) throw error;
    return fetch({ cursor: page.cursor });
  }
}
