import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Section } from "../../components/DetailPanel";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { EmojiText } from "../../components/EmojiText";
import { Timestamp } from "../../components/Timestamp";
import { formatCount, formatSnr, snrLevel, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { seatCounts, seatParts, type SeatKind } from "./poller-seats";
import type { NodePoller, NodePollerTarget } from "./types";
import { useNodePoller } from "./useNodeTelemetry";


// The Poller chip colour, so the meter reads as the same role.
const AMBER = "#ffb454";
const STRIPES = `repeating-linear-gradient(135deg, ${AMBER} 0 3px, transparent 3px 6px)`;
const SEAT_STYLE: Record<SeatKind, { className: string; style?: CSSProperties }> = {
  own: { className: "", style: { background: AMBER, borderColor: AMBER } },
  requested: { className: "", style: { backgroundImage: STRIPES, borderColor: AMBER } },
  free: { className: "border-dashed border-border" },
  closed: { className: "border-border-subtle bg-bg-raised" },
};
const TAG = "shrink-0 rounded-sm px-1.5 py-px font-mono text-[10px] font-semibold tracking-wider uppercase";

const STATE: Record<string, { dot: string; text: string }> = {
  ok: { dot: "bg-green", text: "text-green" },
  pending: { dot: "bg-text-dim", text: "text-text-muted" },
  no_reply: { dot: "bg-warn", text: "text-warn" },
  not_direct: { dot: "bg-danger", text: "text-danger" },
  login_failed: { dot: "bg-danger", text: "text-danger" },
  admin_stop: { dot: "bg-danger", text: "text-danger" },
};
const UNKNOWN_STATE = { dot: "bg-text-dim", text: "text-text-muted" };

// Slot count, seat meter, legend and the claim lines, without a frame so the panel and the dashboard share it.
export function PollerSlots({ claim, readings24h }: { claim: NonNullable<NodePoller["claim"]>; readings24h: number }) {
  const { t } = useTranslation();
  const { slots } = claim;
  const interval = claim.pollIntervalMinutes;
  const seats = seatCounts(slots);
  const parts = seatParts(seats, t);
  const order: SeatKind[] = ["own", "requested", "free", "closed"];
  const label = `${t("nodeDetail.pollerView.slotsUsedOf", { used: slots.used, max: slots.max })}: ${parts.map((p) => p.text).join(", ")}`;
  return (
    <>
      <div className="mb-2 flex items-baseline gap-2 font-mono">
        <span className="text-xl font-semibold text-text-bright"><span>{slots.used}</span> <span className="text-text-dim">/ {slots.max}</span></span>
        <span className="text-[13px] text-text-muted">{t("nodeDetail.pollerView.slotsUsed")}</span>
      </div>
      <div role="img" aria-label={label} className={`flex gap-1 ${claim.live ? "" : "opacity-40"}`}>
        {order.flatMap((kind) => Array.from({ length: seats[kind] }, (_, i) => (
          <span key={`${kind}-${i}`} data-seat={kind} className={`h-3 flex-1 rounded-[2px] border ${SEAT_STYLE[kind].className}`} style={SEAT_STYLE[kind].style} />
        )))}
      </div>
      <div aria-hidden className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-text-muted">
        {parts.map((p) => (
          <span key={p.kind} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-3 rounded-[2px] border ${SEAT_STYLE[p.kind].className}`} style={SEAT_STYLE[p.kind].style} />
            <span>{p.text}</span>
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex flex-col gap-0.5 font-mono text-[13px]">
        {claim.live ? (
          <span><span className="text-text-dim">{t("nodeDetail.pollerView.lastClaim")}</span> <Timestamp value={claim.receivedAt} className="text-text-normal" /></span>
        ) : (
          <span className="text-warn">{t("nodeDetail.pollerView.stale")} <Timestamp value={claim.receivedAt} />.</span>
        )}
        <span><span className="text-text-dim">{t("nodeDetail.pollerView.requests")}</span> <span className="text-text-normal">{t(claim.acceptsRequests ? "nodeDetail.pollerView.accepting" : "nodeDetail.pollerView.notAccepting")}</span></span>
        {interval != null && interval > 0 && (
          <span data-poll-interval><span className="text-text-dim">{t("nodeDetail.pollerView.pollInterval")}</span> <span className="text-text-normal">{interval % 60 === 0 ? t("nodeDetail.pollerView.everyHours", { count: interval / 60 }) : t("nodeDetail.pollerView.everyMinutes", { count: interval })}</span></span>
        )}
        <span><span className="text-text-dim">{t("nodeDetail.pollerView.readings24h")}</span> <span className="text-text-normal">{formatCount(readings24h)}</span></span>
      </div>
    </>
  );
}

function Stat({ label, children, className = "text-text-normal" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] font-medium tracking-wider text-text-dim uppercase">{label}</span>
      <span className={`font-medium ${className}`}>{children}</span>
    </div>
  );
}

// Shown over data that a later refresh failed to replace.
export function PollerRefreshNote({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return <p role="status" data-refresh-failed className={`font-mono text-[11px] text-warn ${className}`}>{t("common.refreshFailed")}</p>;
}

function stateLabel(target: NodePollerTarget, t: TFunction): string {
  switch (target.state) {
    case "ok": return t("nodeDetail.pollerView.state.ok");
    case "pending": return t("nodeDetail.pollerView.state.pending");
    case "no_reply": return t("nodeDetail.pollerView.state.noReply", { count: target.misses });
    case "not_direct": return t("nodeDetail.pollerView.state.notDirect");
    case "login_failed": return t("nodeDetail.pollerView.state.loginFailed");
    case "admin_stop": return t("nodeDetail.pollerView.state.adminStop");
    default: return target.state;
  }
}

function TargetCard({ target, onClick }: { target: NodePollerTarget; onClick?: () => void }) {
  const { t } = useTranslation();
  const level = snrLevel(target.claimedSnr);
  const state = STATE[target.state] ?? UNKNOWN_STATE;
  const ago = (v: number | null) => (v == null ? <span className="text-text-dim">{t("nodeDetail.pollerView.never")}</span> : <Timestamp value={v} />);
  const role = target.role === "poller" ? t("nodes.poller")
    : target.role === "standby" ? t("nodeDetail.pollerView.standby", { rank: target.rank ?? "" }).trim()
    : t("nodeDetail.pollerView.notAssigned");
  const nameClass = `truncate font-mono font-semibold tracking-wider ${target.name ? "text-primary" : "text-text-dim italic"}`;
  const name = <EmojiText text={target.name ?? target.publicKey.slice(0, 8)} />;
  // The name is the keyboard's way in; the card keeps its pointer click, so the button must not fire it twice.
  const open = (event: MouseEvent) => { event.stopPropagation(); onClick?.(); };
  const roleClass = target.role === "poller" ? "text-[#ffb454] border-[#ffb454]/55" : target.role === "standby" ? "text-text-normal border-border" : "text-text-dim border-border-subtle";
  return (
    <div data-target className={`rounded border border-border bg-bg-base px-3 py-2 ${onClick ? "cursor-pointer hover:bg-text-normal/3" : ""}`} onClick={onClick}>
      <div className="mb-1 flex items-center gap-2 text-[11px]">
        {onClick ? (
          <button type="button" onClick={open} className={`${nameClass} text-left hover:underline`}>{name}</button>
        ) : (
          <span className={nameClass}>{name}</span>
        )}
        <span className="ml-auto flex shrink-0 gap-1">
          <span className={`${TAG} ${target.requested ? "bg-primary/8 text-primary" : "bg-text-muted/10 text-text-normal"}`}>{t(target.requested ? "nodeDetail.pollerView.tagRequested" : "nodeDetail.pollerView.tagOwn")}</span>
          <span className={`${TAG} border ${roleClass}`}>{role}</span>
        </span>
      </div>
      {target.state !== "" && (
        <div data-state className={`mb-1.5 flex items-center gap-1.5 font-mono text-[11px] ${state.text}`}>
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${state.dot}`} />
          <span>{stateLabel(target, t)}</span>
        </div>
      )}
      <div className="flex gap-5 font-mono text-xs">
        <Stat label={t("nodeDetail.pollerView.lastReply")}>{ago(target.lastOk)}</Stat>
        <Stat label="SNR" className={level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}>{formatSnr(target.claimedSnr)}</Stat>
        <Stat label={t("nodeDetail.pollerView.reading")}>{ago(target.latestReadingAt)}</Stat>
      </div>
      <div className="mt-1.5 font-mono text-[11px] text-text-muted">
        {target.evidenceCount > 0
          ? t("nodeDetail.pollerView.evidence", { count: target.evidenceCount, snr: formatSnr(target.evidenceSnr) })
          : <span className="text-text-dim">{t("nodeDetail.pollerView.noEvidence")}</span>}
      </div>
    </div>
  );
}

export function PollerLoadError({ isFetching, onRetry }: { isFetching: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="space-y-1 font-mono text-[13px] text-danger">
      <p>{t("nodeDetail.pollerView.loadFailed")}</p>
      <button type="button" disabled={isFetching} className={ACTION_BUTTON_CLASS} onClick={onRetry}>{t("nodeDetail.retry")}</button>
    </div>
  );
}

// The repeater cards. `className` lays them out: a column in the panel, a grid on the dashboard.
export function PollerTargets({ data, onViewNode, className = "flex flex-col gap-2" }: { data: NodePoller; onViewNode?: (nodeId: string) => void; className?: string }) {
  const { t } = useTranslation();
  if (data.targets.length === 0) return <p className="font-mono text-[13px] text-text-dim">{t("nodeDetail.pollerView.noTargets")}</p>;
  return (
    <div className={`${className} ${data.claim?.live ? "" : "opacity-50"}`}>
      {data.targets.map((target) => {
        const id = target.nodeId;
        return <TargetCard key={target.publicKey} target={target} onClick={id && onViewNode ? () => onViewNode(id) : undefined} />;
      })}
    </div>
  );
}

// The node panel's Poller view: this radio's polling slots and the repeaters it polls.
export function NodePollerSection({ nodeId, onViewNode }: { nodeId: string; onViewNode?: (nodeId: string) => void }) {
  const { t } = useTranslation();
  const query = useNodePoller(nodeId, true);
  const data = query.data;
  const NOTE = "px-3 py-2.5 font-mono text-[13px] text-text-dim";

  if (query.state === "failed") return <div className="px-3 py-2.5"><PollerLoadError isFetching={query.isFetching} onRetry={() => void query.refetch()} /></div>;
  // A server without the route: the panel takes the view away, so nothing is drawn meanwhile.
  if (query.state === "unsupported") return null;
  if (!data) return <p role="status" className={NOTE}>{t("common.loading")}</p>;
  const stale = query.refreshFailed && <PollerRefreshNote className="px-3 pt-2" />;
  if (!data.claim) return <>{stale}<p className={`${NOTE} border-t border-border-subtle`}>{t("nodeDetail.pollerView.noClaim")}</p></>;

  return <>
    {stale}
    <Section title={t("nodeDetail.pollerView.slots")}>
      <PollerSlots claim={data.claim} readings24h={data.readings24h} />
    </Section>
    <Section title={t("nodeDetail.pollerView.targets")}>
      <PollerTargets data={data} onViewNode={onViewNode} />
    </Section>
  </>;
}
