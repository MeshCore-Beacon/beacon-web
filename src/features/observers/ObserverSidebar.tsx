import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { formatCount, formatUtc } from "../../lib/formatters";
import { SCROLL_BOTTOM_THRESHOLD_PX } from "../../lib/constants";
import { Segmented } from "../stats/Segmented";
import { observerName as nameOf } from "./observer-filter";
import { deriveObserverStatus } from "./observer-status";
import type { ObserverDirectoryItem, ObserverDirectoryPage, ObserverDirectorySort } from "./types";

export function ObserverSidebar({ observers, filtered, isPending, isError, unsupported, onRetry, onRefresh,
  sort, onSortChange, maxObservationCount, coverage, effectiveSort, windowEnd,
  hasNextPage, isFetchingNextPage, onLoadMore, selectedId, onSelect }: {
  observers: ObserverDirectoryItem[]; filtered: boolean; isPending: boolean; isError: boolean;
  unsupported: boolean; onRetry: () => void; onRefresh?: () => void;
  sort: ObserverDirectorySort; onSortChange: (sort: ObserverDirectorySort) => void;
  maxObservationCount: number | null; coverage?: ObserverDirectoryPage["coverage"];
  effectiveSort?: ObserverDirectorySort; windowEnd?: number;
  hasNextPage: boolean; isFetchingNextPage: boolean; onLoadMore: () => void;
  selectedId: string | null; onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const loadNearEnd = useCallback(() => {
    const element = scroller.current;
    if (element && element.clientHeight > 0 && hasNextPage && !isFetchingNextPage && !isError && !isPending &&
        element.scrollHeight - element.scrollTop - element.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX) onLoadMore();
  }, [hasNextPage, isFetchingNextPage, isError, isPending, onLoadMore]);
  useEffect(() => {
    loadNearEnd();
    const element = scroller.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(loadNearEnd);
    observer.observe(element);
    return () => observer.disconnect();
  }, [loadNearEnd, observers.length]);
  const messageClass = "px-3 py-3 text-center font-mono text-[11px] text-text-dim";
  const retry = <button type="button" onClick={onRetry} className={`${messageClass} w-full text-danger`}>{t("common.loadFailed")} · {t("observerPage.retry")}</button>;

  return (
    <div className="flex min-h-0 w-full flex-col bg-bg-base md:rounded-lg md:border md:border-border md:bg-bg-surface md:p-3.5">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-2 md:mb-2.5 md:border-0 md:p-0">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">{t("tabs.Observers")}</div>
        <Segmented size="sm" ariaLabel={t("observerPage.sort")} value={sort} onChange={v => onSortChange(v as ObserverDirectorySort)}
          options={[{ value: "traffic", label: t("observerPage.sortActivity") }, { value: "name", label: t("observerPage.sortName") }]} />
      </div>
      {onRefresh && !unsupported && <button type="button" onClick={onRefresh} disabled={isPending || isFetchingNextPage}
        className="mb-2 self-end px-3 font-mono text-[10px] text-primary disabled:opacity-50">{t("observerPage.refresh")}</button>}
      {coverage && coverage.status !== "complete" && <p className={messageClass}>
        {t(maxObservationCount != null ? "observerPage.countsPartial"
          : effectiveSort === "name" ? "observerPage.countsUnavailableName" : "observerPage.countsUnavailable")}
      </p>}
      {windowEnd != null && <div className="shrink-0 px-3 pb-2 font-mono text-[10px] text-text-dim">
        <p>{t("observerPage.directoryPeriod")}</p>
        <p>{t("observerPage.countsThrough", { time: formatUtc(windowEnd) })}</p>
      </div>}
      {unsupported ? <div className={messageClass}><p>{t("observerPage.upgradeRequired")}</p>
        <button type="button" onClick={onRetry} className="mt-2 text-primary">{t("observerPage.retry")}</button></div>
        : isPending ? <div className={messageClass}>{t("common.loading")}</div>
        : isError && observers.length === 0 ? retry
        : observers.length === 0 ? <div className={messageClass}>{t(filtered ? "observerPage.noMatches" : "observerPage.none")}</div>
        : <div ref={scroller} onScroll={loadNearEnd} className="min-h-0 overflow-y-auto md:-mx-1 md:px-1">
          <div role="listbox" aria-label={t("tabs.Observers")} className="flex flex-col md:gap-0.5">
            {observers.map(o => {
              const active = o.id === selectedId;
              const count = o.observationCount;
              return (
                <button key={o.id} type="button" role="option" aria-selected={active} onClick={() => onSelect(o.id)}
                  className={`relative shrink-0 overflow-hidden border-b border-l-2 border-b-border-subtle px-4 py-3 text-left md:rounded md:border-b-0 md:px-2.5 md:py-1.5 transition-colors ${
                    active ? "border-primary bg-primary/10" : "border-transparent hover:bg-text-normal/3"
                  }`}>
                  {count != null && maxObservationCount != null && <div className="absolute inset-y-0 left-0 bg-secondary/8 md:bg-secondary/15"
                    style={{ width: `${maxObservationCount > 0 ? Math.min(1, Math.max(0, count / maxObservationCount)) * 100 : 0}%` }} aria-hidden />}
                  <div className="relative flex items-center gap-2">
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${deriveObserverStatus(o) === "online" ? "bg-green" : "bg-text-dim/30"}`} />
                    <span className={`min-w-0 flex-1 truncate font-mono text-[13px] md:text-[12px] ${active ? "text-text-bright" : "text-text-normal"}`}>{nameOf(o)}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">{count != null && maxObservationCount != null ? formatCount(count) : "-"}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {isFetchingNextPage ? <div className={messageClass}>{t("common.loading")}</div>
            : isError ? retry
            : hasNextPage ? <button type="button" onClick={onLoadMore} className={`${messageClass} w-full text-primary`}>{t("observerPage.loadMore")}</button>
            : <div className={messageClass}>{t("observerPage.end")}</div>}
        </div>}
    </div>
  );
}
