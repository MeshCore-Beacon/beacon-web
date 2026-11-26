import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useClickOutside } from "../hooks/useClickOutside";
import { fieldButtonClass, FIELD_LABEL_CLASS, FIELD_VALUE_CLASS, optionRowClass } from "./sheet-field";
import { FieldChevron } from "./FieldChevron";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchable?: boolean;
  align?: "left" | "right";
  fullWidth?: boolean; // stretch + inline panel for the mobile filter sheet
}

// checkbox dropdown with optional search filter

export function MultiSelectDropdown({ label, options, selected, onChange, searchable, align = "left", fullWidth = false }: MultiSelectDropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // the sheet only offers search on long lists; the desktop panel keeps its own rule
  const showSearch = fullWidth ? options.length > 8 : (searchable ?? options.length > 6);

  const closeDropdown = useCallback(() => {
    inputRef.current?.blur(); // drops the on-screen keyboard
    setOpen(false);
  }, []);
  useClickOutside(ref, open, closeDropdown);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // the filter sheet listens on window; only the dropdown should close
      setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    // the sheet never autofocuses: that raises the keyboard before the user asks for it
    if (open && showSearch && !fullWidth) {
      inputRef.current?.focus();
    }
    if (open && fullWidth) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [open, showSearch, fullWidth]);

  const filtered = useMemo(() => {
    if (!filter) return options;
    const q = filter.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, filter]);

  const count = selected.length;

  return (
    <div ref={ref} className={`relative ${fullWidth ? "w-full" : ""}`}>
      <button
        type="button"
        className={fullWidth ? fieldButtonClass(open) : `flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-sm border font-mono cursor-pointer transition-all ${
          count > 0
            ? "border-primary-dim bg-primary/6 text-primary"
            : "border-border bg-bg-surface text-text-muted hover:border-text-dim hover:text-text-normal"
        }`}
        onClick={() => {
          setOpen((prev) => {
            if (prev) {
              setFilter("");
              inputRef.current?.blur();
            }
            return !prev;
          });
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {fullWidth ? (
          <>
            <span className={FIELD_LABEL_CLASS}>{label}</span>
            <span className={FIELD_VALUE_CLASS}>
              {count === 0 ? t("common.all") : options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(", ")}
            </span>
            <FieldChevron open={open} />
          </>
        ) : (
          <>
            {label}
            <span className={`text-[9px] px-1 rounded-sm min-w-[1ch] text-center ${count > 0 ? "bg-primary/15" : "invisible"}`}>
              {count || 0}
            </span>
            <span className="text-text-dim text-[9px]">▾</span>
          </>
        )}
      </button>

      {open && (
        <div className={
          fullWidth
            ? "mt-1 w-full py-1"
            : `absolute top-full mt-1 w-52 ${align === "right" ? "right-0" : "left-0"} max-w-[calc(100vw-1.5rem)] bg-bg-raised border border-border rounded-md shadow-lg z-50 py-1`
        }>
          {showSearch && (
            <div className={fullWidth ? "flex min-h-11 items-center gap-3 border-b border-border-subtle px-4" : "px-2 pb-1"}>
              {fullWidth && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0 text-text-muted">
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("common.filterPlaceholder")}
                className={fullWidth ? "h-11 min-w-0 flex-1 bg-transparent font-mono text-base text-text-bright placeholder:text-text-dim focus:outline-none" : "w-full text-[11px] font-mono bg-bg-surface border border-border rounded px-2 py-1 text-text-bright placeholder:text-text-dim"}
              />
            </div>
          )}

          <div className={`flex items-center border-b border-border-subtle mb-1 ${fullWidth ? "gap-1 px-2" : "gap-1 px-2 py-1"}`}>
            <button
              type="button"
              className={`font-mono transition-colors ${fullWidth ? "min-h-11 px-2 text-base" : "text-[11px]"} ${
                count === options.length ? "text-primary" : "text-text-muted hover:text-text-normal"
              }`}
              onClick={() => onChange(options.map((o) => o.value))}
            >
              {t("common.all")}
            </button>
            <span className="text-border text-[11px]">·</span>
            <button
              type="button"
              className={`font-mono transition-colors ${fullWidth ? "min-h-11 px-2 text-base" : "text-[11px]"} ${
                count === 0 ? "text-primary" : "text-text-muted hover:text-text-normal"
              }`}
              onClick={() => onChange([])}
            >
              {t("common.none")}
            </button>
          </div>

          <div className={fullWidth ? "max-h-[40dvh] overflow-y-auto overscroll-contain" : "max-h-64 overflow-y-auto"} role="listbox" aria-multiselectable="true">
            {filtered.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={fullWidth ? optionRowClass(isSelected) : `w-full flex items-center gap-2 px-2.5 py-1 text-left text-xs font-mono transition-colors ${
                    isSelected
                      ? "text-text-bright bg-primary/10"
                      : "text-text-muted hover:text-text-normal hover:bg-text-normal/3"
                  }`}
                  onClick={() => {
                    if (isSelected) {
                      onChange(selected.filter((v) => v !== opt.value));
                    } else {
                      onChange([...selected, opt.value]);
                    }
                  }}
                >
                  <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                    isSelected
                      ? "border-primary bg-primary/20"
                      : "border-border"
                  }`}>
                    {isSelected && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
                      </svg>
                    )}
                  </span>
                  {opt.label}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2.5 py-2 text-[11px] font-mono text-text-dim">{t("common.noMatches")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
