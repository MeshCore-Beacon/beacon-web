import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getObserversPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { formatCount } from "../../lib/formatters";
import { Card } from "./cards";
import { ObserverTab } from "./ObserverTab";
import { ObserverPicker } from "../observers/ObserverPicker";
import { useObserver } from "./useTelemetry";
import { useTopObservers } from "./useStats";
import type { WsManager } from "../../api/ws-manager";
import type { StatsRange } from "./types";

function ObserverList({ range, selectedId, onSelect }: { range: StatsRange; selectedId: string | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const { iatas, regionKey } = useRegion();
  const [query, setQuery] = useState("");
  // debounce so the server-side lookup fires once per pause, not once per keystroke
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);
  const searching = q.length > 0;

  // Searching swaps the top-by-activity list for a name lookup across every observer in the region.
  const top = useTopObservers(range, 15);
  const max = useMemo(() => Math.max(1, ...(top.data ?? []).map((o) => o.observationCount)), [top.data]);
  const search = useQuery({
    queryKey: ["observer-search", regionKey, q],
    queryFn: () => getObserversPage(iatas, { name: q, limit: 50 }),
    enabled: searching,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  type Row = { id: string; name: string; count?: number; iata?: string; online?: boolean };
  const rows: Row[] = searching
    ? (search.data?.items ?? []).map((o) => ({ id: o.id, name: o.displayName ?? o.id.slice(0, 8), iata: o.iata, online: o.status === "online" }))
    : (top.data ?? []).map((o) => ({ id: o.observerId, name: o.displayName ?? o.observerId.slice(0, 8), count: o.observationCount }));
  const loading = searching ? search.isLoading : top.isLoading;
  const failed = searching ? search.isError : top.isError;

  return (
    <Card title={t("tabs.Observers")} className="w-full">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={t("observerPage.sidebarSearch")}
        placeholder={`${t("observerPage.sidebarSearch")}…`}
        className="mb-2 w-full rounded border border-border bg-bg-base px-2 py-1 font-mono text-[12px] text-text-normal placeholder:text-text-dim"
      />
      <div className="flex flex-col gap-0.5">
        {loading && <div className="py-6 text-center font-mono text-[11px] text-text-dim">{t("common.loading")}</div>}
        {!loading && failed && <div className="py-6 text-center font-mono text-[11px] text-danger">{t("common.loadFailed")}</div>}
        {!loading && !failed && rows.length === 0 && (
          <div className="py-6 text-center font-mono text-[11px] text-text-dim">{t(searching ? "observerPage.noMatches" : "observerPage.none")}</div>
        )}
        {rows.map((r) => {
          const active = r.id === selectedId;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              aria-pressed={active}
              className={`relative cursor-pointer overflow-hidden rounded border-l-2 px-2.5 py-1.5 text-left transition-colors ${
                active ? "border-primary bg-primary/10" : "border-transparent hover:bg-text-normal/3"
              }`}
            >
              {r.count != null && (
                <div className="absolute bottom-0 left-0 h-0.5 bg-secondary/40" style={{ width: `${(r.count / max) * 100}%` }} aria-hidden />
              )}
              <div className="relative flex items-center justify-between gap-2">
                <span className={`truncate font-mono text-[12px] ${active ? "text-text-bright" : "text-text-normal"}`}>{r.name}</span>
                {r.count != null ? (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">{formatCount(r.count)}</span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-text-muted">
                    {r.iata}
                    <span className={`h-1.5 w-1.5 rounded-full ${r.online ? "bg-green" : "bg-text-dim/30"}`} aria-hidden />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

interface Props {
  range: StatsRange;
  selectedObserverId: string | null;
  onSelectObserver: (id: string) => void;
  wsManager: WsManager;
}

export function ObserverAnalyticsTab({ range, selectedObserverId, onSelectObserver, wsManager }: Props) {
  const { t } = useTranslation();
  const top = useTopObservers(range, 15);
  const selected = useObserver(selectedObserverId, true);
  const selectedName = selected.data?.displayName ?? selectedObserverId?.slice(0, 8) ?? t("observerPage.choose");

  // default to the busiest observer once the list loads and nothing is selected
  useEffect(() => {
    if (selectedObserverId) return;
    const first = top.data?.[0];
    if (first) onSelectObserver(first.observerId);
  }, [selectedObserverId, top.data, onSelectObserver]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col lg:flex-row">
      <div className="px-4 pt-4 lg:hidden">
        <ObserverPicker id={selectedObserverId ?? ""} name={selectedName} label={t("tabs.Observers")} onSelect={onSelectObserver} />
      </div>
      <div className="hidden w-[260px] shrink-0 py-4 pl-4 lg:block">
        <ObserverList range={range} selectedId={selectedObserverId} onSelect={onSelectObserver} />
      </div>
      <div className="min-w-0 flex-1">
        <ObserverTab range={range} selectedObserverId={selectedObserverId} onSelectObserver={onSelectObserver} wsManager={wsManager} />
      </div>
    </div>
  );
}
