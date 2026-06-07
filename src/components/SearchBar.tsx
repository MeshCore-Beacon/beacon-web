import { useState, useRef, useEffect } from "react";
import { Dropdown } from "./Dropdown";

export interface SearchFieldOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  fields: SearchFieldOption[];
  field: string;
  onFieldChange: (field: string) => void;
}

// debounced search input with field dropdown

export function SearchBar({ value, onChange, fields, field, onFieldChange }: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the parent resets `value` (e.g. the Clear button), adopt it for display.
  if (prevValue !== value) {
    setPrevValue(value);
    setLocalValue(value);
  }

  // Cancel any pending debounce when the parent value changes, so a stale timer
  // can't fire afterwards and revert the reset.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(val: string) {
    setLocalValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(val);
    }, 300);
  }

  // fall back to the first field if the current selection is unknown
  const currentField = fields.find((f) => f.value === field) ?? fields[0];

  return (
    <div className="flex items-center flex-1 min-w-0">
      <Dropdown
        align="left"
        width="w-32"
        renderTrigger={({ toggle }) => (
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-l-sm border border-r-0 border-border bg-bg-surface text-text-muted hover:text-text-normal transition-colors cursor-pointer"
            onClick={toggle}
          >
            {currentField?.label ?? ""}
            <span className="text-text-dim text-[9px]">▾</span>
          </button>
        )}
      >
        {(close) => fields.map((f) => (
          <button
            key={f.value}
            type="button"
            disabled={f.disabled}
            className={`w-full text-left px-2.5 py-1 text-xs font-mono transition-colors ${
              f.disabled
                ? "text-text-dim/40 cursor-not-allowed"
                : f.value === field
                  ? "text-text-bright bg-primary/10"
                  : "text-text-muted hover:text-text-normal hover:bg-white/3 cursor-pointer"
            }`}
            onClick={() => {
              if (!f.disabled) {
                onFieldChange(f.value);
                close();
              }
            }}
          >
            {f.label}
          </button>
        ))}
      </Dropdown>

      <div className="relative flex-1 min-w-0">
        <svg
          className="absolute left-2 top-1/2 -translate-y-1/2 text-text-dim"
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
          <line x1="10.5" y1="10.5" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={`Search by ${(currentField?.label ?? "").toLowerCase()}...`}
          className="w-full text-[11px] font-mono bg-bg-surface border border-border rounded-r-sm pl-7 pr-7 py-1 text-text-bright placeholder:text-text-dim transition-colors"
        />
        {localValue && (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-normal text-[11px] cursor-pointer"
            onClick={() => handleChange("")}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
