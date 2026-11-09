// One budget for every list that pages itself in (nodes table, map, graph), so paging a whole mesh
// stays under the API's per-minute limit, which is 300 on some deployments. A region-sized load
// fits in the burst; past it, pages go out at a steady pace: at most BURST + 200 in any minute.
const BURST = 40;
const INTERVAL_MS = 300;

// when the slot after the last reserved one opens (GCRA)
let nextSlot = 0;

// Reserves a slot for the next auto-chained page and returns how many ms to wait before fetching it.
export function reservePage(now = Date.now()): number {
  const sendAt = Math.max(now, nextSlot - (BURST - 1) * INTERVAL_MS);
  nextSlot = Math.max(nextSlot, sendAt) + INTERVAL_MS;
  return sendAt - now;
}

// Hands back a reserved slot that went unused (the list unmounted or its query changed first).
export function releasePage(): void {
  nextSlot -= INTERVAL_MS;
}

export function resetPagePacer(): void {
  nextSlot = 0;
}
