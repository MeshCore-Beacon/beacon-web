import { MAP_STYLES } from "./types";

// On-map style switcher. Presentational (mirrors NodeFilterBar): state lives in MapView, which
// passes styleId + onChange. Active state is conveyed via aria-pressed, not color alone.

interface MapStyleSwitcherProps {
  styleId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function MapStyleSwitcher({ styleId, onChange, className }: MapStyleSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Map style"
      className={`flex bg-bg-raised border border-border rounded overflow-hidden ${className ?? ""}`}
    >
      {MAP_STYLES.map((s) => {
        const active = s.id === styleId;
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(s.id)}
            className={`px-2.5 py-1 font-mono text-[11px] transition-colors ${
              active ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal"
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
