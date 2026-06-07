import { Dropdown } from "./Dropdown";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  label: string;
  options: SelectOption[];
  value: string; // "" = none selected (shows allLabel)
  onChange: (value: string) => void;
  align?: "left" | "right";
  allLabel?: string;
  hideAll?: boolean; // omit the "all" entry for required fields where "" isn't a valid choice
}

// single-select dropdown styled to match the packets MultiSelectDropdown trigger

export function SelectDropdown({ label, options, value, onChange, align = "right", allLabel = "All", hideAll = false }: SelectDropdownProps) {
  const active = value !== "";
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <Dropdown
      align={align}
      width="w-52"
      renderTrigger={({ toggle }) => (
        <button
          type="button"
          className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-sm border font-mono cursor-pointer transition-all ${
            active
              ? "border-primary-dim bg-primary/6 text-primary"
              : "border-border bg-bg-surface text-text-muted hover:border-text-dim hover:text-text-normal"
          }`}
          onClick={toggle}
          aria-haspopup="listbox"
        >
          {label}
          <span className={active ? "text-primary" : "text-text-dim"}>{active ? selectedLabel : allLabel}</span>
          <span className="text-text-dim text-[9px]">▾</span>
        </button>
      )}
    >
      {(close) => (
        <div role="listbox">
          {!hideAll && (
            <button
              type="button"
              role="option"
              aria-selected={!active}
              className={`w-full text-left px-2.5 py-1 text-xs font-mono transition-colors ${
                !active ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-white/3"
              }`}
              onClick={() => { onChange(""); close(); }}
            >
              {allLabel}
            </button>
          )}
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`w-full text-left px-2.5 py-1 text-xs font-mono transition-colors ${
                  isSelected ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-white/3"
                }`}
                onClick={() => { onChange(opt.value); close(); }}
              >
                {opt.label}
              </button>
            );
          })}
          {hideAll && options.length === 0 && (
            <div className="px-2.5 py-1 text-xs font-mono text-text-dim">No options</div>
          )}
        </div>
      )}
    </Dropdown>
  );
}
