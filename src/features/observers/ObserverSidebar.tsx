import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getTopObservers } from "../../api/client";
import { formatCount } from "../../lib/formatters";
import { Segmented } from "../stats/Segmented";
import { useStatsRegion } from "../stats/useStats";
import { RANGE_MS, type StatsRange } from "../stats/types";
import { observerName as nameOf } from "./observer-filter";
import { deriveObserverStatus } from "./observer-status";
import type { ObserverSummary } from "./types";

type Sort = "activity" | "name";
const TOP = 200; // the API's list cap

export function ObserverSidebar({ observers, filtered, isPending, isError, onRetry, range, selectedId, onSelect }: {
  observers: ObserverSummary[]; filtered: boolean; isPending: boolean; isError: boolean; onRetry: () => void;
  range: StatsRange; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { where, regionKey } = useStatsRegion();
  const [sort, setSort] = useState<Sort>("activity");

  const activity = useQuery({
    queryKey: ["observer-sidebar-activity", regionKey, range],
    queryFn: () => getTopObservers(where, Date.now() - RANGE_MS[range], TOP),
    staleTime: 30_000,
  });

  const counts = useMemo(() => new Map((activity.data ?? []).map((o) => [o.observerId, o.observationCount])), [activity.data]);
  const max = Math.max(1, ...counts.values());
  const rows = useMemo(() => {
    const byName = (a: ObserverSummary, b: ObserverSummary) => nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true });
    return [...observers].sort(sort === "name" ? byName : (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || byName(a, b));
  }, [observers, sort, counts]);

  return (
    // a card at md+, an edge-to-edge list like the Nodes tab below it
    <div className="flex min-h-0 w-full flex-col bg-bg-base md:rounded-lg md:border md:border-border md:bg-bg-surface md:p-3.5">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-2 md:mb-2.5 md:border-0 md:p-0">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">{t("tabs.Observers")}</div>
        <Segmented size="sm" ariaLabel={t("observerPage.sort")} value={sort} onChange={(v) => setSort(v as Sort)}
          options={[{ value: "activity", label: t("observerPage.sortActivity") }, { value: "name", label: t("observerPage.sortName") }]} />
      </div>
      {isPending ? <div className="py-6 text-center font-mono text-[11px] text-text-dim">{t("common.loading")}</div>
        : isError ? <button type="button" onClick={onRetry} className="py-6 text-center font-mono text-[11px] text-danger">{t("common.loadFailed")} · {t("observerPage.retry")}</button>
        : rows.length === 0 ? <div className="py-6 text-center font-mono text-[11px] text-text-dim">{t(filtered ? "observerPage.noMatches" : "observerPage.none")}</div>
        : (
          <div role="listbox" aria-label={t("tabs.Observers")} className="flex min-h-0 flex-col overflow-y-auto md:-mx-1 md:gap-0.5 md:px-1">
            {rows.map((o) => {
              const active = o.id === selectedId;
              const count = counts.get(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onSelect(o.id)}
                  className={`relative shrink-0 overflow-hidden border-b border-l-2 border-b-border-subtle px-4 py-3 text-left md:rounded md:border-b-0 md:px-2.5 md:py-1.5 transition-colors ${
                    active ? "border-primary bg-primary/10" : "border-transparent hover:bg-text-normal/3"
                  }`}
                >
                  {count != null && <div className="absolute inset-y-0 left-0 bg-secondary/8 md:bg-secondary/15" style={{ width: `${(count / max) * 100}%` }} aria-hidden />}
                  <div className="relative flex items-center gap-2">
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${deriveObserverStatus(o) === "online" ? "bg-green" : "bg-text-dim/30"}`} />
                    <span className={`min-w-0 flex-1 truncate font-mono text-[13px] md:text-[12px] ${active ? "text-text-bright" : "text-text-normal"}`}>{nameOf(o)}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">{count != null ? formatCount(count) : "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}
