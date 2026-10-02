import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getObserversPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { Dropdown } from "../../components/Dropdown";

function PickerPanel({ id, onPick, excludeId, label }: { id: string; onPick: (id: string) => void; excludeId?: string; label: string }) {
  const { t } = useTranslation();
  const { iatas, regionKey, isResolved } = useRegion();
  const [query, setQuery] = useState("");
  // debounce so the server-side lookup fires once per pause, not once per keystroke
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const options = useQuery({
    queryKey: ["observer-picker", regionKey, q],
    queryFn: () => getObserversPage(iatas, { name: q || undefined, limit: 50 }),
    enabled: isResolved !== false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const rows = (options.data?.items ?? []).filter((o) => o.id !== excludeId);
  const status = options.isPending ? t("common.loading") : options.isError ? null : rows.length === 0 ? t("observerPage.noMatches") : null;

  return (
    <>
      <div className="sticky -top-1 -mt-1 border-b border-border-subtle bg-bg-raised p-1.5">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && rows[0]) { e.preventDefault(); onPick(rows[0].id); }
          }}
          aria-label={`${t("observerPage.sidebarSearch")} · ${label}`}
          placeholder={`${t("observerPage.sidebarSearch")}…`}
          className="w-full rounded border border-border bg-bg-base px-2 py-1 font-mono text-base text-text-normal placeholder:text-text-dim sm:text-[12px]"
        />
      </div>
      <div role="listbox" aria-label={label} className="py-1">
        {rows.map((o) => {
          const selected = o.id === id;
          return (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onPick(o.id)}
              className={`flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left font-mono text-xs transition-colors ${
                selected ? "bg-primary/10 text-text-bright" : "text-text-normal hover:bg-text-normal/3"
              }`}
            >
              <span className="truncate">{o.displayName ?? o.id.slice(0, 8)}</span>
              <span className="shrink-0 text-[11px] text-text-dim">{o.iata}</span>
            </button>
          );
        })}
      </div>
      {status && <div role="status" className="px-2.5 py-2 font-mono text-[11px] text-text-dim">{status}</div>}
      {options.isError && (
        <button type="button" onClick={() => void options.refetch()} className="w-full px-2.5 py-2 text-left font-mono text-[11px] text-danger">
          {t("common.loadFailed")} · {t("observerPage.retry")}
        </button>
      )}
    </>
  );
}

// One field that opens a searchable list; the search runs server-side across the whole region.
export function ObserverPicker({ id, name, onSelect, excludeId, label }: { id: string; name: string; onSelect: (id: string) => void; excludeId?: string; label?: string }) {
  const { t } = useTranslation();
  const title = label ?? t("observerPage.choose");
  return (
    <Dropdown
      align="left"
      width="w-full min-w-64"
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${title}: ${name}`}
          className={`flex w-full min-w-0 items-center justify-between gap-2 rounded border bg-bg-base px-2.5 py-1.5 text-left font-mono text-[12px] transition-colors ${
            open ? "border-primary-dim" : "border-border hover:border-text-dim"
          }`}
        >
          <span className={`truncate ${id ? "text-text-bright" : "text-text-dim"}`}>{name}</span>
          <span className="shrink-0 text-[9px] text-text-dim" aria-hidden>▾</span>
        </button>
      )}
    >
      {(close) => <PickerPanel id={id} excludeId={excludeId} label={title} onPick={(next) => { onSelect(next); close(); }} />}
    </Dropdown>
  );
}
