import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

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
}

// checkbox dropdown with optional search filter

export function MultiSelectDropdown({ label, options, selected, onChange, searchable, align = "left" }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showSearch = searchable ?? options.length > 6;

  const closeDropdown = useCallback(() => setOpen(false), []);
  useClickOutside(ref, open, closeDropdown);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    if (open && showSearch) {
      inputRef.current?.focus();
    }
  }, [open, showSearch]);

  const filtered = useMemo(() => {
    if (!filter) return options;
    const q = filter.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, filter]);

  const count = selected.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-sm border font-mono cursor-pointer transition-all ${
          count > 0
            ? "border-primary-dim bg-primary/6 text-primary"
            : "border-border bg-bg-surface text-text-muted hover:border-text-dim hover:text-text-normal"
        }`}
        onClick={() => {
          setOpen((prev) => {
            if (prev) setFilter("");
            return !prev;
          });
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
        <span className={`text-[9px] px-1 rounded-sm min-w-[1ch] text-center ${count > 0 ? "bg-primary/15" : "invisible"}`}>
          {count || 0}
        </span>
        <span className="text-text-dim text-[9px]">▾</span>
      </button>

      {open && (
        <div className={`absolute top-full mt-1 w-52 bg-bg-raised border border-border rounded-md shadow-lg z-50 py-1 ${align === "right" ? "right-0" : "left-0"}`}>
          {showSearch && (
            <div className="px-2 pb-1">
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter..."
                className="w-full text-[11px] font-mono bg-bg-surface border border-border rounded px-2 py-1 text-text-bright placeholder:text-text-dim"
              />
            </div>
          )}

          <div className="flex items-center gap-1 px-2 py-1 border-b border-border-subtle mb-1">
            <button
              type="button"
              className={`text-[11px] font-mono transition-colors ${
                count === options.length ? "text-primary" : "text-text-muted hover:text-text-normal"
              }`}
              onClick={() => onChange(options.map((o) => o.value))}
            >
              All
            </button>
            <span className="text-border text-[11px]">·</span>
            <button
              type="button"
              className={`text-[11px] font-mono transition-colors ${
                count === 0 ? "text-primary" : "text-text-muted hover:text-text-normal"
              }`}
              onClick={() => onChange([])}
            >
              None
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {filtered.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`w-full flex items-center gap-2 px-2.5 py-1 text-left text-xs font-mono transition-colors ${
                    isSelected
                      ? "text-text-bright bg-primary/10"
                      : "text-text-muted hover:text-text-normal hover:bg-white/3"
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
              <div className="px-2.5 py-2 text-[11px] font-mono text-text-dim">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
