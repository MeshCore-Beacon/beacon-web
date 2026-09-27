import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getObserversPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";

export function ObserverPicker({ id, name, onSelect }: { id: string; name: string; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const { iatas, regionKey } = useRegion();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { const timer = setTimeout(() => setQuery(text.trim()), 250); return () => clearTimeout(timer); }, [text]);
  const options = useQuery({ queryKey: ["observer-picker", regionKey, query], queryFn: () => getObserversPage(iatas, { name: query || undefined, limit: 50 }), staleTime: 30_000 });
  const rows = options.data?.items ?? [];
  return <div className="min-w-0 space-y-1 text-sm">
    <div className="flex flex-wrap gap-2">
      <input type="search" aria-label={t("observerPage.search")} placeholder={t("observerPage.search")} value={text} onChange={e => setText(e.target.value)} className="min-h-11 min-w-0 flex-1 rounded border border-border bg-bg-base px-3 text-text-normal" />
      <select aria-label={t("observerPage.choose")} value={id} onChange={e => onSelect(e.target.value)} className="min-h-11 min-w-0 max-w-full flex-1 rounded border border-border bg-bg-base px-3 text-text-normal">
        {!rows.some(o => o.id === id) && <option value={id}>{name}</option>}
        {rows.map(o => <option key={o.id} value={o.id}>{o.displayName ?? o.id.slice(0, 8)} · {o.iata}</option>)}
      </select>
    </div>
    {options.isError ? <button type="button" onClick={() => void options.refetch()} className="text-danger">{t("common.loadFailed")} · {t("observerPage.retry")}</button> : <p className="text-xs text-text-muted">{options.isFetching ? t("common.loading") : t("observerPage.searchHelp")}</p>}
  </div>;
}
