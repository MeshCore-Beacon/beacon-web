import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "./BottomSheet";
import { CloseButton } from "./CloseButton";

// Mobile filter trigger: funnel + active count, styled like a dropdown trigger.
export function FiltersButton({ activeCount, onClick }: { activeCount: number; onClick: () => void }) {
  const { t } = useTranslation();
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
      {t("common.filters")}
      {active && (
        <span className="text-[9px] px-1 rounded-sm bg-primary/15 min-w-[1ch] text-center">{activeCount}</span>
      )}
    </button>
  );
}

// Bottom sheet that holds a filter bar's controls stacked full-width on mobile, with Clear/Done.
export function FilterSheet({ onClose, onClear, children, doneLabel, onDone, doneDisabled }: {
  onClose: () => void;
  onClear?: () => void;
  children: ReactNode;
  // for filters that are submitted rather than applied as they are picked: the primary action and its label
  doneLabel?: string;
  onDone?: () => void;
  doneDisabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet onClose={onClose} label={t("common.filters")}>
      <div className="flex items-center justify-between px-4 pb-3 shrink-0">
        <span className="text-lg font-mono font-medium text-text-bright">{t("common.filters")}</span>
        <CloseButton onClose={onClose} label={t("common.closeFilters")} className="-mr-2 w-11! h-11!" />
      </div>

      <div className="flex flex-col gap-4 px-4 pt-4 pb-2 overflow-y-auto">{children}</div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border-subtle shrink-0">
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 px-2 text-[15px] font-mono text-primary cursor-pointer transition-colors hover:opacity-80"
          >
            {t("common.clearAll")}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onDone ?? onClose}
          disabled={doneDisabled}
          className="min-h-11 min-w-28 rounded-md bg-primary px-6 text-[15px] font-mono font-semibold text-bg-base cursor-pointer transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {doneLabel ?? t("common.done")}
        </button>
      </div>
    </BottomSheet>
  );
}
