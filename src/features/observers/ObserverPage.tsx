import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ObserverTable } from "./ObserverTable";
import { observerDestination, observerRange } from "./observer-navigation";
import type { WsManager } from "../../api/ws-manager";
const ObserverTab = lazy(() => import("../stats/ObserverTab").then(m => ({ default: m.ObserverTab })));

export function ObserverPage({ wsManager }: { wsManager: WsManager }) {
  const [params, setParams] = useSearchParams();
  const { t } = useTranslation();
  const id = params.get("observer");
  const range = observerRange(params.get("range"));
  const select = (observer: string | null) => setParams(observerDestination(params, observer, range));
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {/* Keep the directory mounted so Back restores filters, sorting and scroll. */}
    <div className={id ? "hidden" : "flex min-h-0 flex-1"} aria-hidden={id ? true : undefined}>
      <ObserverTable wsManager={wsManager} selectedObserverId={null} onSelectObserver={select} />
    </div>
    {id && <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <button type="button" onClick={() => select(null)} className="min-h-11 text-sm text-primary">← {t("observerPage.back")}</button>
        <label className="ml-auto flex items-center gap-2 text-sm text-text-muted">{t("observerPage.range")}
          <select aria-label={t("observerPage.range")} value={range} onChange={e => setParams(observerDestination(params, id, observerRange(e.target.value)))} className="min-h-11 rounded border border-border bg-bg-raised px-3 text-text-normal">
            <option value="24h">24h</option><option value="7d">7d</option><option value="30d">30d</option>
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<p role="status" className="p-4">{t("common.loading")}</p>}>
          <ObserverTab range={range} selectedObserverId={id} onSelectObserver={select} wsManager={wsManager} />
        </Suspense>
      </div>
    </div>}
  </div>;
}
