import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getObserversPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { SearchBar } from "../../components/SearchBar";
import { SelectDropdown } from "../../components/SelectDropdown";

export function ObserverPicker({ id, name, onSelect, excludeId, label }: { id: string; name: string; onSelect: (id: string) => void; excludeId?: string; label?: string }) {
  const { t } = useTranslation();
  const { iatas, regionKey } = useRegion();
  const [query, setQuery] = useState("");
  const options = useQuery({ queryKey: ["observer-picker", regionKey, query.trim()], queryFn: () => getObserversPage(iatas, { name: query.trim() || undefined, limit: 50 }), staleTime: 30_000 });
  const rows = (options.data?.items ?? []).filter(o => o.id !== excludeId);
  return <div className="min-w-0 space-y-1 text-sm">
    <div className="flex flex-wrap gap-2">
      <SearchBar hideField inputLabel={label ? `${t("observerPage.search")} · ${label}` : t("observerPage.search")} fields={[{ value: "name", label: t("observerPage.search") }]} field="name" onFieldChange={() => {}} value={query} onChange={setQuery} />
      <SelectDropdown
        label={label ?? t("observerPage.choose")}
        allLabel={name}
        hideAll
        align="left"
        value={id}
        onChange={onSelect}
        options={[
          ...(!rows.some(o => o.id === id) ? [{ value: id, label: name }] : []),
          ...rows.map(o => ({ value: o.id, label: `${o.displayName ?? o.id.slice(0, 8)} · ${o.iata}` })),
        ]}
      />
    </div>
    {options.isError ? <button type="button" onClick={() => void options.refetch()} className="text-danger">{t("common.loadFailed")} · {t("observerPage.retry")}</button> : <p className="text-xs text-text-muted">{options.isFetching ? t("common.loading") : t("observerPage.searchHelp")}</p>}
  </div>;
}
