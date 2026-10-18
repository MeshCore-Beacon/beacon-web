interface SegmentedOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  // wrap = individual rounded pills (flex-wrap); default = a connected bar
  wrap?: boolean;
  className?: string;
  // locks the control (e.g. a setting another mode overrides); the value still shows
  disabled?: boolean;
  // locks just these options, e.g. one another mode overrides
  disabledValues?: string[];
}

// Single-select segmented control; active state uses aria-pressed, not color alone.

export function SegmentedControl({ options, value, onChange, ariaLabel, wrap = false, className, disabled = false, disabledValues }: SegmentedControlProps) {
  const containerCls = wrap
    ? `flex flex-wrap gap-1 ${className ?? ""}`
    : `flex bg-bg-raised border border-border rounded-sm overflow-hidden ${className ?? ""}`;
  const stateCls = disabled ? "opacity-50" : "";

  const buttonCls = (active: boolean) =>
    wrap
      ? `px-2 py-0.5 font-mono text-[11px] rounded-sm border transition-colors cursor-pointer ${
          active
            ? "border-primary-dim bg-primary/10 text-text-bright"
            : "border-border text-text-muted hover:text-text-normal hover:border-text-dim"
        }`
      : `flex-1 px-2.5 py-1 font-mono text-[11px] transition-colors cursor-pointer ${
          active ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-text-normal/3"
        }`;

  return (
    <div role="group" aria-label={ariaLabel} className={`${containerCls} ${stateCls}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={disabled || disabledValues?.includes(o.value)}
            onClick={() => onChange(o.value)}
            className={`${buttonCls(active)} disabled:cursor-not-allowed ${disabledValues?.includes(o.value) ? "opacity-40" : ""}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
