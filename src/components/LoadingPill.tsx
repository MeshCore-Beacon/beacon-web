import { useTranslation } from "react-i18next";

type LoadingNoun = "nodes" | "routes" | "packets" | "messages" | "observers";

interface LoadingPillProps {
  loading: boolean;
  error?: boolean;
  count: number; // rows loaded so far
  noun: LoadingNoun;
  label?: string; // optional complete localized phrase
  position?: string; // corner placement (the parent must be `relative`)
}

// Small floating status pill shared by the map and the entity tables: a muted "Loading … (N)" while
// pages stream in, a danger-toned message if a fetch fails. Renders nothing when idle.
export function LoadingPill({ loading, error, count, noun, label, position = "bottom-3 left-3" }: LoadingPillProps) {
  const { t } = useTranslation();
  if (!loading && !error) return null;
  const tone = loading ? "text-text-muted" : "text-danger";
  const dot = loading ? "bg-primary animate-pulse" : "bg-danger";
  return (
    <div
      role="status"
      className={`absolute ${position} z-10 flex items-center gap-2 px-2.5 py-1 bg-bg-surface border border-border-subtle rounded-md font-mono text-[11px] ${tone} shadow-lg`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {label ?? (loading
        ? t(`loadingPill.${noun}.loading`, { count })
        : count > 0
          ? t(`loadingPill.${noun}.partial`, { count })
          : t(`loadingPill.${noun}.failed`))}
    </div>
  );
}
