interface PacketFlowButtonProps {
  active: boolean;
  onToggle: () => void;
}

// Floating play/stop control for the live packet-flow animation. Off by default; when live it shows
// a pulsing dot and accent styling. Bottom-center, clear of the corner map controls.
export function PacketFlowButton({ active, onToggle }: PacketFlowButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? "Stop live packet flow" : "Play live packet flow"}
      title={active ? "Stop live packet flow" : "Play live packet flow"}
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-lg font-mono text-[11px] uppercase tracking-wider transition-colors cursor-pointer ${
        active
          ? "bg-primary/15 border-primary-dim text-text-bright"
          : "bg-bg-raised border-border text-text-dim hover:text-text-normal"
      }`}
    >
      {active ? (
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
          <path d="M2 1.5v7l6-3.5z" />
        </svg>
      )}
      Live
    </button>
  );
}
