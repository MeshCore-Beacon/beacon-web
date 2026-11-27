import type { ReactNode } from "react";
import { Glyph } from "../../components/NodeChips";
import { Tooltip } from "../../components/Tooltip";
import type { AtlasView } from "./atlas";

const SIZE = 13;
const stroke = (body: ReactNode, width = 2.2) => (
  <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    {body}
  </svg>
);
const ICON: Record<AtlasView, ReactNode> = {
  analytics: stroke(<path d="M5 20V11M12 20V4M19 20v-6" />, 2.4),
  heard: stroke(
    <>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.3 4.5a10.6 10.6 0 0 0 0 15M19.7 4.5a10.6 10.6 0 0 1 0 15" />
    </>,
  ),
  observer: <Glyph name="observer" size={SIZE} />,
  telemetry: stroke(
    <>
      <path d="M4.5 18a9 9 0 1 1 15 0" />
      <path d="M12 14l4-5" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
    </>,
  ),
};

interface ViewTabsProps {
  views: AtlasView[];
  value: AtlasView;
  onChange: (view: AtlasView) => void;
  label: (view: AtlasView) => string;
  ariaLabel: string;
  className?: string;
}

// The card's tabs as icons; only the open one spells its name, so four fit a phone in any language.
// Sized and coloured as Segmented size="xs".
export function ViewTabs({ views, value, onChange, label, ariaLabel, className = "" }: ViewTabsProps) {
  return (
    <div role="group" aria-label={ariaLabel} className={`flex w-full items-center gap-0.5 rounded-md border border-border bg-bg-raised p-0.5 ${className}`}>
      {views.map((view) => {
        const active = view === value;
        const name = label(view);
        return (
          <Tooltip key={view} label={name} off={active} hideOnPress className={active ? "min-w-0 flex-1" : "w-11 shrink-0"}>
            <button
              type="button"
              data-view={view}
              aria-label={name}
              aria-pressed={active}
              onClick={() => onChange(view)}
              className={`flex h-[22px] w-full min-w-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded px-2.5 font-mono text-[11px] leading-4 font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
                active ? "bg-primary/15 text-text-bright ring-1 ring-inset ring-primary/30" : "text-text-muted hover:text-text-normal"
              }`}
            >
              {ICON[view]}
              {active && <span className="min-w-0 truncate">{name}</span>}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
