import type { TFunction } from "i18next";
import type { NodePoller } from "./types";

type Slots = NonNullable<NodePoller["claim"]>["slots"];
export type SeatKind = "own" | "requested" | "free" | "closed";

// Seats in drawing order, cut at max: what is left after used and free is not on offer.
export function seatCounts(slots: Slots): Record<SeatKind, number> {
  const count = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
  let left = count(slots.max);
  const take = (n: number) => { const got = Math.min(count(n), left); left -= got; return got; };
  const own = take(slots.own);
  const requested = take(slots.requested);
  const free = take(slots.free);
  return { own, requested, free, closed: left };
}

export function seatParts(seats: Record<SeatKind, number>, t: TFunction): { kind: SeatKind; text: string }[] {
  const parts: { kind: SeatKind; text: string }[] = [
    { kind: "own", text: t("nodeDetail.pollerView.own", { count: seats.own }) },
    { kind: "requested", text: t("nodeDetail.pollerView.requested", { count: seats.requested }) },
    { kind: "free", text: t("nodeDetail.pollerView.free", { count: seats.free }) },
  ];
  if (seats.closed > 0) parts.push({ kind: "closed", text: t("nodeDetail.pollerView.notOffered", { count: seats.closed }) });
  return parts;
}
