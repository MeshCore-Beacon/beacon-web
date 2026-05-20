import type { Observation } from "../../types/api";
import { formatTimeOnly, formatSnr, snrLevel, formatPropagation, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { HopBadge } from "../../components/HopBadge";

// single observation with signal stats and resolved path

export function ObservationCard({ observation, selected, onClick }: { observation: Observation; selected?: boolean; onClick?: () => void }) {
  const level = snrLevel(observation.snr);

  return (
    <div
      className={`bg-bg-base border border-border rounded px-3 py-2.5 border-l-2 transition-colors ${
        selected
          ? "border-l-secondary bg-secondary/5"
          : "border-l-primary"
      } ${onClick ? "cursor-pointer hover:bg-white/3" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 text-[11px] mb-1.5">
        <span className="text-text-bright font-semibold">{observation.observerName}</span>
        <span className="font-mono text-primary font-semibold text-[11px] bg-primary/6 px-1.5 py-[1px] rounded-sm">
          {observation.iata}
        </span>
        <span className="text-text-dim ml-auto font-mono text-[11px]">
          {formatTimeOnly(observation.heardAt)}
        </span>
      </div>

      <div className="flex gap-[18px] font-mono text-[11px]">
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">SNR</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>
            {formatSnr(observation.snr)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">RSSI</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>
            {observation.rssi ?? "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">Prop</span>
          <span className="font-medium text-text-normal">{formatPropagation(observation.propagationTimeMs)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">Hops</span>
          <span className="font-medium text-text-normal">{observation.hopCount}</span>
        </div>
      </div>

      {observation.resolvedPath.length > 0 && (
        <div className="flex items-center gap-1 mt-[7px] font-mono text-[11px] pt-1.5 border-t border-border-subtle">
          <span className="text-text-dim uppercase text-[10px] font-medium tracking-wider mr-1">Path</span>
          {observation.resolvedPath.map((hop, i) => (
            <span key={i} className="contents">
              {i > 0 && <span className="text-text-dim text-xs" aria-hidden>→</span>}
              <HopBadge hop={hop} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
