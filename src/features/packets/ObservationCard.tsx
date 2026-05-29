import type { Observation } from "../../types/api";
import { formatTimeOnly, formatSnr, snrLevel, formatPropagation, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { HopBadge } from "../../components/HopBadge";

// single observation with signal stats and resolved path

export function ObservationCard({ observation: obs, selected, onClick }: { observation: Observation; selected?: boolean; onClick?: () => void }) {
  const level = snrLevel(obs.snr);

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
        <span className="text-text-bright font-semibold">{obs.observerName ?? obs.observerId.slice(0, 8)}</span>
        <span className="font-mono text-primary font-semibold text-[11px] bg-primary/6 px-1.5 py-px rounded-sm">
          {obs.iata}
        </span>
        <span className="text-text-dim ml-auto font-mono text-[11px]">
          {formatTimeOnly(obs.heardAt)}
        </span>
      </div>

      <div className="flex gap-5 font-mono text-xs">
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">SNR</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>
            {formatSnr(obs.snr)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">RSSI</span>
          <span className={`font-medium ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-normal"}`}>
            {obs.rssi ?? "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">Prop</span>
          <span className="font-medium text-text-normal">{formatPropagation(obs.propagationTimeMs)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-text-dim text-[10px] font-medium uppercase tracking-wider">Hops</span>
          <span className="font-medium text-text-normal">{obs.hopCount}</span>
        </div>
      </div>

      {obs.resolvedPath.length > 0 && (
        <div className="flex items-center gap-1 mt-2 font-mono text-[11px] pt-1.5 border-t border-border-subtle">
          <span className="text-text-dim uppercase text-[10px] font-medium tracking-wider mr-1">Path</span>
          {obs.resolvedPath.map((hop, i) => (
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
