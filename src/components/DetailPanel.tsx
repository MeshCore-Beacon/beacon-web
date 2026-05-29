import type { ReactNode } from "react";

// shared scaffolding for the right-hand entity detail panels (observers, nodes, …)

export function Section({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${first ? "" : "border-t border-border-subtle"}`}>
      <div className="text-xs font-mono font-medium text-text-bright uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span><span className="text-text-dim">{label} </span><span className="text-text-normal">{value}</span></span>
  );
}

interface DetailPanelProps {
  title: string;
  onClose: () => void;
  isLoading?: boolean;
  notFound?: boolean;
  notFoundIcon?: ReactNode;
  notFoundLabel?: string;
  children: ReactNode;
}

export function DetailPanel({ title, onClose, isLoading, notFound, notFoundIcon, notFoundLabel = "Not found", children }: DetailPanelProps) {
  return (
    <div className="shrink-0 w-[400px] border-l border-border bg-bg-surface flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
        <span className="text-[13px] font-mono font-medium text-text-dim uppercase tracking-wider">{title}</span>
        <button
          type="button"
          className="text-text-dim hover:text-text-normal cursor-pointer transition-colors"
          onClick={onClose}
          aria-label="Close detail panel"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-dim">
            <span className="text-[13px] font-mono">Loading...</span>
          </div>
        ) : notFound ? (
          <div className="flex flex-col items-center justify-center h-full gap-2.5 text-text-dim">
            {notFoundIcon}
            <span className="text-[13px] font-mono">{notFoundLabel}</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
