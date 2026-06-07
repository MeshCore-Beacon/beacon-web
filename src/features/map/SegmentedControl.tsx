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
}

// Single-select segmented control; active state uses aria-pressed, not color alone.

export function SegmentedControl({ options, value, onChange, ariaLabel, wrap = false, className }: SegmentedControlProps) {
  const containerCls = wrap
    ? `flex flex-wrap gap-1 ${className ?? ""}`
    : `flex bg-bg-raised border border-border rounded-sm overflow-hidden ${className ?? ""}`;

  const buttonCls = (active: boolean) =>
    wrap
      ? `px-2 py-0.5 font-mono text-[11px] rounded-sm border transition-colors cursor-pointer ${
          active
            ? "border-primary-dim bg-primary/10 text-text-bright"
            : "border-border text-text-muted hover:text-text-normal hover:border-text-dim"
        }`
      : `flex-1 px-2.5 py-1 font-mono text-[11px] transition-colors cursor-pointer ${
          active ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-white/3"
        }`;

  return (
    <div role="group" aria-label={ariaLabel} className={containerCls}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={buttonCls(active)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
