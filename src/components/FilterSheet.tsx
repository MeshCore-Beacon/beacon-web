import type { ReactNode } from "react";
import { BottomSheet } from "./BottomSheet";
import { CloseButton } from "./CloseButton";

// Mobile filter trigger: funnel + active count, styled like a dropdown trigger.
export function FiltersButton({ activeCount, onClick }: { activeCount: number; onClick: () => void }) {
  const active = activeCount > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-sm border font-mono cursor-pointer transition-all shrink-0 ${
        active
          ? "border-primary-dim bg-primary/6 text-primary"
          : "border-border bg-bg-surface text-text-muted hover:border-text-dim hover:text-text-normal"
      }`}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M2 3h12l-4.5 5.5V13L6.5 11.5V8.5L2 3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      Filters
      {active && (
        <span className="text-[9px] px-1 rounded-sm bg-primary/15 min-w-[1ch] text-center">{activeCount}</span>
      )}
    </button>
  );
}

// Bottom sheet that holds a filter bar's controls stacked full-width on mobile, with Clear/Done.
export function FilterSheet({ onClose, onClear, children }: {
  onClose: () => void;
  onClear?: () => void;
  children: ReactNode;
}) {
  return (
    <BottomSheet onClose={onClose} label="Filters">
      <div className="flex items-center justify-between px-4 pb-2 shrink-0">
        <span className="text-[13px] font-mono font-medium text-text-dim uppercase tracking-wider">Filters</span>
        <CloseButton onClose={onClose} label="Close filters" className="-mr-1" />
      </div>

      <div className="flex flex-col gap-3 px-4 py-2 overflow-y-auto">{children}</div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border-subtle shrink-0">
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-mono text-text-dim hover:text-danger px-2 py-1.5 cursor-pointer transition-colors"
          >
            Clear all
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-mono font-medium text-primary border border-primary-dim bg-primary/6 rounded px-4 py-1.5 cursor-pointer transition-colors hover:bg-primary/10"
        >
          Done
        </button>
      </div>
    </BottomSheet>
  );
}
