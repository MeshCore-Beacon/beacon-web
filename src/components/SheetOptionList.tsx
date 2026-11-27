import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface Option {
  value: string;
  label: string;
}

// The one option list for every mobile filter sheet field: optional search row, a scrolling list and
// rows with a leading marker (round radio for single-select, square checkbox for multi-select).
export function SheetOptionList({ mode, options, isSelected, onPick, firstRow, header, emptyLabel }: {
  mode: "single" | "multi";
  options: Option[];
  isSelected: (value: string) => boolean;
  onPick: (value: string) => void;
  // single-select "All" / "Any" choice, shown first while not searching
  firstRow?: { label: string; selected: boolean; onPick: () => void };
  header?: ReactNode; // e.g. All / None for the multi-select
  emptyLabel?: string;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const showSearch = options.length > 8;

  // closing drops the keyboard; the search box is never focused for the user
  useEffect(() => {
    const input = inputRef.current;
    return () => { if (input && document.activeElement === input) input.blur(); };
  }, [showSearch]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, filter]);

  const showFirst = firstRow && !filter.trim();

  return (
    <div className="mt-1 w-full py-1">
      {showSearch && (
        <div className="flex min-h-11 items-center gap-3 border-b border-border-subtle px-4">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-text-muted">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("common.filterPlaceholder")}
            className="h-11 min-w-0 flex-1 bg-transparent font-mono text-base text-text-bright placeholder:text-text-dim focus:outline-none"
          />
        </div>
      )}
      {header}
      <div
        role="listbox"
        aria-multiselectable={mode === "multi" ? true : undefined}
        className="max-h-[40dvh] overflow-y-auto overscroll-contain"
      >
        {showFirst && <Row mode={mode} label={firstRow.label} selected={firstRow.selected} onPick={firstRow.onPick} />}
        {filtered.map((o) => (
          <Row key={o.value} mode={mode} label={o.label} selected={isSelected(o.value)} onPick={() => onPick(o.value)} />
        ))}
        {filtered.length === 0 && !showFirst && (
          <div className="min-h-11 px-4 py-3 font-mono text-[15px] text-text-dim">{emptyLabel ?? t("common.noMatches")}</div>
        )}
      </div>
    </div>
  );
}

function Row({ mode, label, selected, onPick }: { mode: "single" | "multi"; label: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={`flex min-h-11 w-full items-center gap-3 px-4 text-left font-mono text-[15px] transition-colors ${
        selected ? "bg-bg-raised text-text-bright" : "text-text-normal"
      }`}
    >
      <OptionMarker mode={mode} selected={selected} />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

export function OptionMarker({ mode, selected }: { mode: "single" | "multi"; selected: boolean }) {
  return (
    <span
        data-marker={mode === "single" ? "radio" : "checkbox"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${mode === "single" ? "rounded-full" : "rounded-[5px]"} ${
          selected ? "border-primary" : "border-border"
        } ${selected && mode === "multi" ? "bg-primary" : ""}`}
      >
        {selected && mode === "single" && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
        {selected && mode === "multi" && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="text-bg-base">
            <path d="M2.5 6.2 5 8.7 9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
  );
}
