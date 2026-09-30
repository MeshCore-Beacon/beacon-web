import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getObserversPage, getTopObservers } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { formatCount } from "../../lib/formatters";
import { Card } from "../stats/cards";
import { Segmented } from "../stats/Segmented";
import { RANGE_MS, type StatsRange } from "../stats/types";
import type { ObserverSummary } from "./types";

type Sort = "activity" | "name";
const PAGE = 200; // the API's list cap
const MAX_PAGES = 10;

// The whole region fits in a page or two, so sorting and search stay client-side and instant.
async function allObservers(iatas: string[] | undefined): Promise<ObserverSummary[]> {
  const items: ObserverSummary[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await getObserversPage(iatas, cursor == null ? { limit: PAGE } : { cursor, limit: PAGE });
    items.push(...page.items);
    if (!page.hasMore || page.nextCursor == null) break;
    cursor = page.nextCursor;
  }
  return items;
}

const nameOf = (o: ObserverSummary) => o.displayName ?? o.id.slice(0, 8);

export function ObserverSidebar({ range, selectedId, onSelect }: { range: StatsRange; selectedId: string | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const { iatas, regionKey } = useRegion();
  const [sort, setSort] = useState<Sort>("activity");
  const [query, setQuery] = useState("");

  const list = useQuery({ queryKey: ["observer-sidebar", regionKey], queryFn: () => allObservers(iatas), staleTime: 30_000, refetchInterval: 60_000 });
  const activity = useQuery({
    queryKey: ["observer-sidebar-activity", regionKey, range],
    queryFn: () => getTopObservers(iatas, Date.now() - RANGE_MS[range], PAGE),
    staleTime: 30_000,
  });

  const counts = useMemo(() => new Map((activity.data ?? []).map((o) => [o.observerId, o.observationCount])), [activity.data]);
  const max = Math.max(1, ...counts.values());
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = (list.data ?? []).filter((o) => !q || nameOf(o).toLowerCase().includes(q) || o.iata.toLowerCase().includes(q));
    const byName = (a: ObserverSummary, b: ObserverSummary) => nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true });
    return [...matched].sort(sort === "name" ? byName : (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || byName(a, b));
  }, [list.data, query, sort, counts]);

  return (
    <Card
      title={t("tabs.Observers")}
      right={<Segmented size="sm" ariaLabel={t("observerPage.sort")} value={sort} onChange={(v) => setSort(v as Sort)}
        options={[{ value: "activity", label: t("observerPage.sortActivity") }, { value: "name", label: t("observerPage.sortName") }]} />}
      className="flex min-h-0 w-full flex-col"
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t("observerPage.sidebarSearch")}
        placeholder={`${t("observerPage.sidebarSearch")}…`}
        className="mb-2 w-full rounded border border-border bg-bg-base px-2 py-1 font-mono text-base text-text-normal placeholder:text-text-dim sm:text-[12px]"
      />
      {list.isPending ? <div className="py-6 text-center font-mono text-[11px] text-text-dim">{t("common.loading")}</div>
        : list.isError ? <button type="button" onClick={() => void list.refetch()} className="py-6 text-center font-mono text-[11px] text-danger">{t("common.loadFailed")} · {t("observerPage.retry")}</button>
        : rows.length === 0 ? <div className="py-6 text-center font-mono text-[11px] text-text-dim">{t(query ? "observerPage.noMatches" : "observerPage.none")}</div>
        : (
          <div role="listbox" aria-label={t("tabs.Observers")} className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1">
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
                  className={`relative shrink-0 overflow-hidden rounded border-l-2 px-2.5 py-1.5 text-left transition-colors ${
                    active ? "border-primary bg-primary/10" : "border-transparent hover:bg-text-normal/3"
                  }`}
                >
                  {count != null && <div className="absolute bottom-0 left-0 h-0.5 bg-secondary/40" style={{ width: `${(count / max) * 100}%` }} aria-hidden />}
                  <div className="relative flex items-center gap-2">
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${o.status === "online" ? "bg-green" : "bg-text-dim/30"}`} />
                    <span className={`min-w-0 flex-1 truncate font-mono text-[12px] ${active ? "text-text-bright" : "text-text-normal"}`}>{nameOf(o)}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">{count != null ? formatCount(count) : "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
    </Card>
  );
}
