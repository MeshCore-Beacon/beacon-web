import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CloseButton } from "./CloseButton";
import { InfoTip } from "./InfoTip";

// shared scaffolding for the right-hand entity detail panels (observers, nodes, …)

type InfoLines = string | (string | false | null | undefined)[];
const TITLE = "text-xs font-mono font-medium text-text-bright uppercase tracking-wider";

function Title({ title, info }: { title: ReactNode; info?: InfoLines }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{title}</span>
      {info && <InfoTip text={info} />}
    </span>
  );
}

export function Section({ title, info, children, first }: { title: ReactNode; info?: InfoLines; children: ReactNode; first?: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${first ? "" : "border-t border-border-subtle"}`}>
      <div className={`${TITLE} mb-1.5`}><Title title={title} info={info} /></div>
      {children}
    </div>
  );
}

const FOLDS_KEY = "beacon-detail-folds";

function readFolds(): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FOLDS_KEY) ?? "{}");
    return value && typeof value === "object" ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

// A section for reference info: closed by default, a one-line summary when closed, and remembered per id.
export function FoldSection({ id, title, summary, info, children }: { id: string; title: ReactNode; summary?: string; info?: InfoLines; children: ReactNode }) {
  const [open, setOpen] = useState(() => readFolds()[id] === true);
  const toggle = (next: boolean) => {
    if (next === open) return;
    setOpen(next);
    try {
      localStorage.setItem(FOLDS_KEY, JSON.stringify({ ...readFolds(), [id]: next }));
    } catch {
      // the fold still works for this visit
    }
  };
  return (
    <details open={open} onToggle={(e) => toggle(e.currentTarget.open)} className="group border-t border-border-subtle px-3 py-2.5">
      <summary className={`${TITLE} flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden`}>
        <span aria-hidden className="text-[10px] text-text-dim transition-transform group-open:rotate-90">▸</span>
        <Title title={title} info={info} />
        {summary && <span className="ml-auto min-w-0 truncate font-normal normal-case tracking-normal text-[11px] text-text-dim group-open:hidden">{summary}</span>}
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span><span className="text-text-dim">{label} </span><span className="text-text-normal">{value}</span></span>
  );
}

// Minimize/expand toggle for the mobile overlay only; at md+ the panel is a sidebar so it's hidden.
export function MinimizeButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={t(collapsed ? "common.expandDetailPanel" : "common.minimizeDetailPanel")}
      className="md:hidden flex items-center justify-center w-9 h-9 rounded text-text-muted hover:text-text-bright hover:bg-text-normal/5 cursor-pointer transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d={collapsed ? "M3 10L8 5L13 10" : "M3 6L8 11L13 6"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

interface DetailPanelProps {
  title: string;
  onClose: () => void;
  closeLabel?: string;
  // mobile-only: adds a minimize toggle that collapses to a bottom bar without deselecting, so the
  // map underneath (and its neighbor lines) stays visible. No effect at md+ (the panel is a sidebar).
  collapsible?: boolean;
  isLoading?: boolean;
  notFound?: boolean;
  notFoundIcon?: ReactNode;
  notFoundLabel?: string;
  // action rendered in the header, left of the minimize/close controls (e.g. a Copy Link button)
  headerAction?: ReactNode;
  children: ReactNode;
}

export function DetailPanel({ title, onClose, closeLabel, collapsible, isLoading, notFound, notFoundIcon, notFoundLabel, headerAction, children }: DetailPanelProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  // collapse only touches the mobile overlay: shrink to a bottom bar and hide the body. The md:*
  // classes below always win at desktop width, so a lingering collapsed state never hides the sidebar.
  const minimized = Boolean(collapsible && collapsed);
  return (
    <div className={`${minimized ? "absolute inset-x-0 bottom-0" : "absolute inset-0"} z-30 w-full md:static md:inset-auto md:z-auto md:shrink-0 md:w-[400px] md:border-l border-border bg-bg-surface flex flex-col min-h-0 overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
        <span className="text-[13px] font-mono font-medium text-text-dim uppercase tracking-wider">{title}</span>
        <div className="flex items-center gap-1.5 -mr-1">
          {headerAction}
          <div className="flex items-center gap-0.5">
            {collapsible && <MinimizeButton collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />}
            <CloseButton onClose={onClose} label={closeLabel ?? t("common.closeDetailPanel")} />
          </div>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto min-h-0 ${minimized ? "hidden md:block" : ""}`}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-dim">
            <span className="text-[13px] font-mono">{t("common.loadingDots")}</span>
          </div>
        ) : notFound ? (
          <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-dim">
            {notFoundIcon}
            <span className="text-[13px] font-mono">{notFoundLabel ?? t("common.notFound")}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
