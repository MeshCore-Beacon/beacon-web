import { BeaconLogo } from "./BeaconLogo";

// shared empty/placeholder state: faint on-brand beacon mark + message

interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 flex-1 h-full min-h-[12rem] py-12 text-center select-none">
      <BeaconLogo size={36} className="text-border" />
      <div className="flex flex-col gap-1">
        <span className="text-text-muted text-sm font-mono tracking-wide">{title}</span>
        {subtitle && <span className="text-text-dim text-xs font-mono">{subtitle}</span>}
      </div>
    </div>
  );
}
