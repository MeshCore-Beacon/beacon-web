interface LoadingPillProps {
  loading: boolean;
  error?: boolean;
  count: number; // rows loaded so far
  noun: string; // plural entity name, e.g. "nodes" / "observers"
  position?: string; // corner placement (the parent must be `relative`)
}

// Small floating status pill shared by the map and the entity tables: a muted "Loading … (N)" while
// pages stream in, a danger-toned message if a fetch fails. Renders nothing when idle.
export function LoadingPill({ loading, error, count, noun, position = "bottom-3 left-3" }: LoadingPillProps) {
  if (!loading && !error) return null;
  const tone = loading ? "text-text-muted" : "text-danger";
  const dot = loading ? "bg-primary animate-pulse" : "bg-danger";
  return (
    <div
      role="status"
      className={`absolute ${position} z-10 flex items-center gap-2 px-2.5 py-1 bg-bg-surface border border-border-subtle rounded-md font-mono text-[11px] ${tone} shadow-lg`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {loading
        ? `Loading ${noun}… (${count})`
        : count > 0
          ? `Some ${noun} failed to load (${count} shown)`
          : `Failed to load ${noun}`}
    </div>
  );
}
