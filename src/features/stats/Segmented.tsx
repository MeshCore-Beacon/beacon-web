import type { ReactNode } from "react";

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}

// A contained "pill group" segmented control bound to the palette: the active pill gets a primary
// tint + inset ring, inactive pills are muted. Used for the Stats sub-tabs (md, with icons) and the
// time-range selector (sm). Active state is conveyed with aria-pressed, not color alone.
export function Segmented({ options, value, onChange, ariaLabel, size = "sm", className }: SegmentedProps) {
  const pad = size === "md" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 rounded-md border border-border bg-bg-raised p-0.5 ${className ?? ""}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded font-mono font-semibold tracking-wide transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${pad} ${
              active
                ? "bg-primary/15 text-text-bright ring-1 ring-inset ring-primary/30"
                : "text-text-muted hover:text-text-normal"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
