import { useTranslation } from "react-i18next";
import { Tooltip } from "../../components/Tooltip";
import { useTick } from "../../hooks/useTick";
import { formatAbsolute, formatCount, timeAgoParts } from "../../lib/formatters";
import { seatCounts, seatParts, type SeatKind } from "../nodes/poller-seats";
import type { NodePoller } from "../nodes/types";
import { StatCard } from "../stats/cards";

const POLLER_AMBER = "#ffb454";
const STRIPES = `repeating-linear-gradient(135deg, ${POLLER_AMBER} 0 3px, transparent 3px 6px)`;
// A radio has this many slots; the ones it does not offer are drawn dim.
const SEATS = 8;
const ORDER: SeatKind[] = ["own", "requested", "free", "closed"];
const VISUAL = "mt-1.5 flex h-[20px] items-center";
const spacer = <div className="mt-1.5 h-[20px]" />;
const DOT: Record<string, string> = { ok: "bg-green", pending: "bg-text-dim/40", no_reply: "bg-warn" };

type Claim = NonNullable<NodePoller["claim"]>;

function SlotMeter({ slots }: { slots: Claim["slots"] }) {
  const { t } = useTranslation();
  const counts = seatCounts({ ...slots, max: Math.min(slots.max, SEATS) });
  const seats = ORDER.flatMap((kind) => Array<SeatKind>(counts[kind]).fill(kind));
  return (
    <div role="img" aria-label={seatParts(counts, t).map((part) => part.text).join(", ")} className={`${VISUAL} gap-[3px]`}>
      {seats.map((kind, i) => (
        <span
          key={i}
          data-seat={kind}
          className={`h-2.5 min-w-0 flex-1 rounded-[2px] border ${kind === "free" ? "border-dashed border-border" : kind === "closed" ? "border-transparent bg-text-dim/20" : ""}`}
          style={kind === "own" ? { background: POLLER_AMBER, borderColor: POLLER_AMBER } : kind === "requested" ? { backgroundImage: STRIPES, borderColor: POLLER_AMBER } : undefined}
        />
      ))}
    </div>
  );
}

// How long ago, kept live. Its own wording because the app-wide "x ago" overflows a tile in French and Swedish.
function ClaimAge({ at }: { at: number }) {
  const { t } = useTranslation();
  useTick();
  const { count, unit } = timeAgoParts(at);
  return <Tooltip label={formatAbsolute(at)}>{t("atlas.poller.claimAge", { duration: t(`timestamp.unit.${unit}`, { count }) })}</Tooltip>;
}

// The Poller tab's four tiles. They are fixed: slots, repeaters answering, readings and the claim.
export function PollerTiles({ poller }: { poller: NodePoller | undefined }) {
  const { t } = useTranslation();
  const claim = poller?.claim;
  const dash = "—";
  const targets = poller?.targets ?? [];
  const tile = { compact: true, accent: POLLER_AMBER };
  return (
    <div className="grid flex-1 grid-cols-2 gap-3">
      <StatCard
        {...tile}
        label={t("nodeDetail.pollerView.slots")}
        value={claim ? `${claim.slots.used}/${claim.slots.max}` : dash}
        sublabel={claim && t("atlas.poller.split", { own: claim.slots.own, requested: claim.slots.requested })}
        visual={claim ? <SlotMeter slots={claim.slots} /> : spacer}
      />
      <StatCard
        {...tile}
        label={t("atlas.poller.answering")}
        value={poller ? targets.filter((target) => target.state === "ok").length : dash}
        sublabel={poller && t("atlas.poller.of", { total: targets.length })}
        visual={
          <div aria-hidden className={`${VISUAL} gap-1.5 overflow-hidden`}>
            {targets.map((target) => <span key={target.publicKey} data-state={target.state} className={`h-2 w-2 shrink-0 rounded-full ${DOT[target.state] ?? "bg-danger"}`} />)}
          </div>
        }
      />
      <StatCard {...tile} label={t("atlas.poller.readings")} value={poller ? formatCount(poller.readings24h) : dash} sublabel={t("atlas.ranges.24h")} visual={spacer} />
      <StatCard
        {...tile}
        label={t("atlas.poller.lastClaim")}
        value={claim ? <span data-claim className={claim.live ? "" : "text-warn"}><ClaimAge at={claim.receivedAt} /></span> : dash}
        visual={
          <div className={`${VISUAL} font-mono text-[10px] leading-[10px] text-text-muted`}>
            {claim && <span className="line-clamp-2">{t(!claim.live ? "atlas.poller.notPolling" : claim.acceptsRequests ? "atlas.poller.accepting" : "atlas.poller.notAccepting")}</span>}
          </div>
        }
      />
    </div>
  );
}
