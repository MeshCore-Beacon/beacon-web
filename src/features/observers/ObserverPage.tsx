import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tooltip } from "../../components/Tooltip";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { useTick } from "../../hooks/useTick";
import { ObserverTable } from "./ObserverTable";
import { ObserverSidebar } from "./ObserverSidebar";
import { observerDestination, observerRange } from "./observer-navigation";
import { Segmented } from "../stats/Segmented";
import type { WsManager } from "../../api/ws-manager";
const ObserverTab = lazy(() => import("../stats/ObserverTab").then(m => ({ default: m.ObserverTab })));

function CopyLinkIcon({ value, label, copiedLabel }: { value: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip label={copied ? copiedLabel : label}>
      <button
        type="button"
        aria-label={label}
        onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className={`flex h-7 w-7 items-center justify-center rounded border transition-colors ${copied ? "border-green/40 text-green" : "border-border text-text-muted hover:border-text-dim hover:text-text-bright"}`}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          {copied ? <path d="m3.5 8.5 3 3 6-7" /> : <><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8" /><path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8" /></>}
        </svg>
      </button>
    </Tooltip>
  );
}

const NAV_CHIP = "inline-flex items-center gap-1.5 rounded-sm border border-border bg-bg-raised px-2 py-0.5 font-mono text-[11px] text-text-normal transition-colors hover:border-text-dim hover:text-text-bright";

export function ObserverPage({ wsManager, onReturn, returnLabel }: { wsManager: WsManager; onReturn?: () => void; returnLabel?: string }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const returnButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { returnButton.current?.focus(); }, []);
  // Dashboard adjustments belong to this visit; Back returns to the original investigation.
  const visitOptions = onReturn ? { replace: true, state: location.state } : undefined;
  const { t } = useTranslation();
  const now = useTick(60_000);
  const id = params.get("observer");
  const [actionTime, setActionTime] = useState(() => Date.now());
  const hourAt = (time: number) => Math.floor(time / 3_600_000) * 3_600_000;
  const comparing = params.has("compareWith");
  const anchor = params.has("compareUntil") ? Number(params.get("compareUntil")) : hourAt(actionTime);
  const validAnchor = params.getAll("compareUntil").length <= 1 && Number.isSafeInteger(anchor) && anchor > now - 30 * 86_400_000 && anchor <= Math.max(now, actionTime);
  const until = validAnchor ? anchor : null;
  const range = observerRange(params.get("range"));
  const share = new URL(window.location.pathname, window.location.origin); share.search = params.toString();
  if (id) share.searchParams.set("range", range);
  if (comparing && until != null) share.searchParams.set("compareUntil", String(until));
  const select = (observer: string | null) => setParams(observerDestination(params, observer, range), visitOptions);
  const compare = (observer: string) => {
    // eslint-disable-next-line react-hooks/purity -- Capture time when the user invokes this event callback.
    const clickedAt = Date.now();
    setActionTime(clickedAt);
    setParams(old => {
      const next = new URLSearchParams(old);
      next.set("compareWith", observer);
      next.set("compareUntil", String(comparing ? until ?? hourAt(clickedAt) : hourAt(clickedAt)));
      return next;
    }, visitOptions);
  };
  const closeCompare = () => setParams(old => { const next = new URLSearchParams(old); next.delete("compareWith"); next.delete("compareUntil"); return next; }, visitOptions);
  const refreshCompare = () => {
    const clickedAt = Date.now();
    setActionTime(clickedAt);
    setParams(old => {
      const next = new URLSearchParams(old);
      next.set("compareUntil", String(hourAt(clickedAt)));
      return next;
    }, { replace: true, state: location.state });
    return hourAt(clickedAt);
  };
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {(id || onReturn) && <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
      {onReturn && <button ref={returnButton} type="button" aria-label={t("observerPage.returnTo", { page: returnLabel })} onClick={onReturn} className={NAV_CHIP}><span aria-hidden>‹</span>{returnLabel}</button>}
      {id && <>
        <button type="button" aria-label={t("observerPage.back")} onClick={() => select(null)} className={NAV_CHIP}><span aria-hidden>‹</span>{t("observerPage.directory")}</button>
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-text-muted">{t("observerPage.range")}
          <Segmented ariaLabel={t("observerPage.range")} size="sm" value={range} options={[{ value: "24h", label: t("stats.ranges.24h") }, { value: "7d", label: t("stats.ranges.7d") }, { value: "30d", label: t("stats.ranges.30d") }]} onChange={v => setParams(observerDestination(params, id, observerRange(v)), visitOptions)} />
        </span>
      </>}
    </div>}
    <div className="flex min-h-0 min-w-0 flex-1">
      {/* The directory stays mounted behind a dashboard so its search and filters survive Back. */}
      <aside aria-label={t("tabs.Observers")} className={id ? "hidden" : "flex min-h-0 min-w-0 flex-1"}>
        <ObserverTable wsManager={wsManager} selectedObserverId={null} onSelectObserver={select} />
      </aside>
      {id && <div className="hidden min-h-0 w-[260px] shrink-0 flex-col py-4 pl-4 md:flex">
        <ObserverSidebar range={range} selectedId={id} onSelect={select} />
      </div>}
    {id && <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<p role="status" className="p-4">{t("common.loading")}</p>}>
          <ObserverTab range={range} selectedObserverId={id} onSelectObserver={select} wsManager={wsManager} actions={<>
            <CopyLinkIcon value={share.toString()} label={t("observerPage.copyLink")} copiedLabel={t("observerPage.copied")} />
            <button type="button" onClick={() => comparing ? closeCompare() : compare("")} className={ACTION_BUTTON_CLASS}>{t(comparing ? "observerCompare.close" : "observerCompare.open")}</button>
          </>} comparison={comparing ? { id: params.getAll("compareWith").length === 1 ? params.get("compareWith") ?? "" : "invalid", until, onSelect: compare, onRefresh: refreshCompare } : undefined} />
        </Suspense>
      </div>
    </div>}
    </div>
  </div>;
}
