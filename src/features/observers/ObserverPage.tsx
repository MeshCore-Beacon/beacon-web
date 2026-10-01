import { lazy, Suspense, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getBrokers } from "../../api/client";
import { CloseButton } from "../../components/CloseButton";
import { CopyButton } from "../../components/CopyButton";
import { MinimizeButton } from "../../components/DetailPanel";
import { EmptyState } from "../../components/EmptyState";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { useScopes } from "../../hooks/useScopes";
import { useTick } from "../../hooks/useTick";
import { ObserverFilterBar } from "./ObserverFilterBar";
import { ObserverSidebar } from "./ObserverSidebar";
import { filterObservers } from "./observer-filter";
import { useObserverDirectory } from "./useObserverDirectory";
import { observerDestination, observerRange } from "./observer-navigation";
import { Segmented } from "../stats/Segmented";
import type { WsManager } from "../../api/ws-manager";
const ObserverTab = lazy(() => import("../stats/ObserverTab").then(m => ({ default: m.ObserverTab })));

export function ObserverPage({ wsManager }: { wsManager: WsManager }) {
  const [params, setParams] = useSearchParams();
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
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [broker, setBroker] = useState("");
  const [scope, setScope] = useState("");
  const [minimized, setMinimized] = useState(false);
  const directory = useObserverDirectory(wsManager, broker);
  const { data: brokers } = useQuery({ queryKey: ["brokers"], queryFn: getBrokers, staleTime: 60_000 });
  const scopeOptions = useScopes(scope);
  const typeOptions = useMemo(() => [...new Set((directory.data ?? []).flatMap((o) => o.observerType ? [o.observerType] : []))].sort(), [directory.data]);
  const observers = useMemo(() => filterObservers(directory.data ?? [], { search, status, type, scope }, now), [directory.data, search, status, type, scope, now]);
  const share = new URL(window.location.pathname, window.location.origin); share.search = params.toString();
  if (id) share.searchParams.set("range", range);
  if (comparing && until != null) share.searchParams.set("compareUntil", String(until));
  const select = (observer: string | null) => { setMinimized(false); setParams(observerDestination(params, observer, range)); };
  const compare = (observer: string) => {
    // eslint-disable-next-line react-hooks/purity -- Capture time when the user invokes this event callback.
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
    return hourAt(clickedAt);
  };
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <ObserverFilterBar
      search={search} onSearchChange={setSearch} searchField={searchField} onSearchFieldChange={setSearchField}
      statusFilter={status} onStatusChange={setStatus} typeFilter={type} onTypeChange={setType} typeOptions={typeOptions}
      brokerFilter={broker} onBrokerChange={setBroker} brokerOptions={brokers?.map((b) => b.name) ?? []}
      scopeFilter={scope} onScopeChange={setScope} scopeOptions={scopeOptions}
      trailing={<span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-text-muted"><span className="hidden sm:inline">{t("observerPage.range")}</span>
          <Segmented ariaLabel={t("observerPage.range")} size="sm" value={range} options={[{ value: "24h", label: t("stats.ranges.24h") }, { value: "7d", label: t("stats.ranges.7d") }, { value: "30d", label: t("stats.ranges.30d") }]} onChange={v => setParams(observerDestination(params, id, observerRange(v)))} />
        </span>}
    />
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 w-full shrink-0 flex-col md:w-[260px] md:p-4 md:pr-0">
        <ObserverSidebar observers={observers} filtered={Boolean(search || status || type || broker || scope)} isPending={directory.isPending} isError={directory.isError}
          onRetry={() => void directory.refetch()} range={range} selectedId={id} onSelect={select} />
      </div>
      {/* below md the dashboard overlays the list, like the node detail panel */}
      {id ? <div className={`${minimized ? "absolute inset-x-0 bottom-0" : "absolute inset-0"} z-30 flex min-h-0 min-w-0 flex-col bg-bg-base md:static md:z-auto md:flex-1`}>
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-3 py-2 md:hidden">
          <span className="font-mono text-[13px] font-medium uppercase tracking-wider text-text-dim">{t("observerPage.detail")}</span>
          <div className="-mr-1 flex items-center gap-0.5">
            <MinimizeButton collapsed={minimized} onToggle={() => setMinimized(v => !v)} />
            <CloseButton onClose={() => select(null)} label={t("observerPage.back")} />
          </div>
        </div>
        <div className={`min-h-0 flex-1 overflow-auto ${minimized ? "hidden md:block" : ""}`}>
        <Suspense fallback={<p role="status" className="p-4">{t("common.loading")}</p>}>
          <ObserverTab range={range} selectedObserverId={id} onSelectObserver={select} wsManager={wsManager} actions={<>
            <CopyButton value={share.toString()} label={t("observerPage.copyLinkShort")} copiedLabel={t("observerPage.copied")} ariaLabel={t("observerPage.copyLink")} className="justify-center py-1" />
            <button type="button" onClick={() => comparing ? closeCompare() : compare("")} className={`${ACTION_BUTTON_CLASS} text-center`}>{t(comparing ? "observerCompare.close" : "observerCompare.open")}</button>
          </>} comparison={comparing ? { id: params.getAll("compareWith").length === 1 ? params.get("compareWith") ?? "" : "invalid", until, onSelect: compare, onRefresh: refreshCompare } : undefined} />
        </Suspense>
        </div>
      </div> : <div className="hidden min-w-0 flex-1 md:flex"><EmptyState title={t("observerPage.choose")} /></div>}
    </div>
  </div>;
}
