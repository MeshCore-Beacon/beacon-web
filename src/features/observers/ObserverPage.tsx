import { lazy, Suspense, useState, useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CopyButton } from "../../components/CopyButton";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { useTick } from "../../hooks/useTick";
import { ObserverTable } from "./ObserverTable";
import { observerDestination, observerRange } from "./observer-navigation";
import { Segmented } from "../stats/Segmented";
import type { WsManager } from "../../api/ws-manager";
const ObserverTab = lazy(() => import("../stats/ObserverTab").then(m => ({ default: m.ObserverTab })));

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
      {onReturn && <button ref={returnButton} type="button" aria-label={t("observerPage.returnTo", { page: returnLabel })} onClick={onReturn} className="font-mono text-[11px] text-primary hover:underline">← {t("observerPage.returnTo", { page: returnLabel })}</button>}
      {id && <>
        <button type="button" onClick={() => select(null)} className="font-mono text-[11px] text-primary hover:underline">{onReturn ? t("observerPage.directory") : `← ${t("observerPage.back")}`}</button>
        <CopyButton value={share.toString()} label={t("observerPage.copyLink")} copiedLabel={t("observerPage.copied")} />
        <button type="button" onClick={() => comparing ? closeCompare() : compare("")} className={ACTION_BUTTON_CLASS}>{t(comparing ? "observerCompare.close" : "observerCompare.open")}</button>
        <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-text-muted">{t("observerPage.range")}
          <Segmented ariaLabel={t("observerPage.range")} size="sm" value={range} options={[{ value: "24h", label: t("stats.ranges.24h") }, { value: "7d", label: t("stats.ranges.7d") }, { value: "30d", label: t("stats.ranges.30d") }]} onChange={v => setParams(observerDestination(params, id, observerRange(v)), visitOptions)} />
        </span>
      </>}
    </div>}
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside aria-label={t("tabs.Observers")} className={id ? "hidden min-h-0 w-64 shrink-0 border-r border-border md:flex" : "flex min-h-0 min-w-0 flex-1"}>
        <ObserverTable wsManager={wsManager} compact={!!id} selectedObserverId={id} onSelectObserver={select} />
      </aside>
    {id && <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<p role="status" className="p-4">{t("common.loading")}</p>}>
          <ObserverTab range={range} selectedObserverId={id} onSelectObserver={select} wsManager={wsManager} comparison={comparing ? { id: params.getAll("compareWith").length === 1 ? params.get("compareWith") ?? "" : "invalid", until, onSelect: compare, onRefresh: refreshCompare } : undefined} />
        </Suspense>
      </div>
    </div>}
    </div>
  </div>;
}
