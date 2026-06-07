import type { Observation } from "../../types/api";
import { formatSnr, snrLevel, formatPropagation, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import { PathData } from "./PathData";
import { IataChip } from "../../components/IataChip";

// single observation with signal stats and resolved path

export function ObservationCard({ observation: obs, selected, onClick, onViewNode, isTrace }: { observation: Observation; selected?: boolean; onClick?: () => void; onViewNode?: (nodeId: string) => void; isTrace?: boolean }) {
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
        <IataChip>{obs.iata}</IataChip>
        <Timestamp value={obs.heardAt} className="text-text-dim ml-auto font-mono text-[11px]" />
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
          <span className="font-medium text-text-normal">{obs.pathLength.hopCount}</span>
        </div>
      </div>

      {obs.pathBytes && (
        <div className="flex items-center gap-1 mt-2 font-mono text-[11px] pt-1.5 border-t border-border-subtle">
          {isTrace ? (
            // TRACE path bytes are per-hop SNR samples, not hop hashes — show them raw, never as a resolvable path.
            <>
              <span className="text-text-dim uppercase text-[10px] font-medium tracking-wider mr-1">Path SNR</span>
              <span className="text-text-normal break-all">{obs.pathBytes.toUpperCase()}</span>
            </>
          ) : (
            <>
              <span className="text-text-dim uppercase text-[10px] font-medium tracking-wider mr-1">Path</span>
              <PathData pathBytes={obs.pathBytes} hashSize={obs.pathLength.hashSize} resolvedPath={obs.resolvedPath} size="sm" onViewNode={onViewNode} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
