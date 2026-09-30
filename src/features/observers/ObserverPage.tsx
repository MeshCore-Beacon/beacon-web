import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CopyButton } from "../../components/CopyButton";
import { useTick } from "../../hooks/useTick";
import { ObserverTable } from "./ObserverTable";
import { observerDestination, observerRange } from "./observer-navigation";
import type { WsManager } from "../../api/ws-manager";
const ObserverTab = lazy(() => import("../stats/ObserverTab").then(m => ({ default: m.ObserverTab })));

export function ObserverPage({ wsManager }: { wsManager: WsManager }) {
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation();
  const now = useTick(60_000);
  const id = params.get("observer");
  const [directoryVisited, setDirectoryVisited] = useState(!id);
  const [actionTime, setActionTime] = useState(() => Date.now());
  const hourAt = (time: number) => Math.floor(time / 3_600_000) * 3_600_000;
  const comparing = params.has("compareWith");
  const anchor = params.has("compareUntil") ? Number(params.get("compareUntil")) : hourAt(actionTime);
  const validAnchor = params.getAll("compareUntil").length <= 1 && Number.isSafeInteger(anchor) && anchor > now - 30 * 86_400_000 && anchor <= Math.max(now, actionTime);
  const until = validAnchor ? anchor : null;
  if (!id && !directoryVisited) setDirectoryVisited(true);
  const share = new URL(window.location.pathname, window.location.origin); share.search = params.toString();
  if (comparing && until != null) share.searchParams.set("compareUntil", String(until));
  const range = observerRange(params.get("range"));
  const select = (observer: string | null) => setParams(observerDestination(params, observer, range));
  const compare = (observer: string) => {
    const clickedAt = Date.now();
    setActionTime(clickedAt);
    setParams(old => {
      const next = new URLSearchParams(old);
      next.set("compareWith", observer);
      next.set("compareUntil", String(comparing ? until ?? hourAt(clickedAt) : hourAt(clickedAt)));
      return next;
    });
  };
  const closeCompare = () => setParams(old => { const next = new URLSearchParams(old); next.delete("compareWith"); next.delete("compareUntil"); return next; });
  const refreshCompare = () => {
    const clickedAt = Date.now();
    setActionTime(clickedAt);
    setParams(old => {
      const next = new URLSearchParams(old);
      next.set("compareUntil", String(hourAt(clickedAt)));
      return next;
    }, { replace: true });
  };
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {/* Keep the directory mounted so Back restores filters, sorting and scroll. */}
    {directoryVisited && <div className={id ? "hidden" : "flex min-h-0 flex-1"} aria-hidden={id ? true : undefined}>
      <ObserverTable wsManager={wsManager} selectedObserverId={null} onSelectObserver={select} />
    </div>}
    {id && <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <button type="button" onClick={() => select(null)} className="min-h-11 text-sm text-primary">← {t("observerPage.back")}</button>
        <CopyButton value={share.toString()} label={t("observerPage.copyLink")} copiedLabel={t("observerPage.copied")} />
        <button type="button" onClick={() => comparing ? closeCompare() : compare("")} className="min-h-11 text-sm text-primary">{t(comparing ? "observerCompare.close" : "observerCompare.open")}</button>
        <label className="ml-auto flex items-center gap-2 text-sm text-text-muted">{t("observerPage.range")}
          <select aria-label={t("observerPage.range")} value={range} onChange={e => setParams(observerDestination(params, id, observerRange(e.target.value)))} className="min-h-11 rounded border border-border bg-bg-raised px-3 text-text-normal">
            <option value="24h">24h</option><option value="7d">7d</option><option value="30d">30d</option>
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<p role="status" className="p-4">{t("common.loading")}</p>}>
          <ObserverTab range={range} selectedObserverId={id} onSelectObserver={select} wsManager={wsManager} comparison={comparing ? { id: params.getAll("compareWith").length === 1 ? params.get("compareWith") ?? "" : "invalid", until, onSelect: compare, onRefresh: refreshCompare } : undefined} />
        </Suspense>
      </div>
    </div>}
  </div>;
}
