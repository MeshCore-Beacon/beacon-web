import type { Observation } from "../../types/api";
import { formatSnr, formatPropagation, snrLevel, SIGNAL_LEVEL_CLASSES } from "../../lib/formatters";
import { Timestamp } from "../../components/Timestamp";
import { PathData } from "./PathData";

interface Props {
  observations: Observation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

// Per-observer readings vary by distance; presentational component owned by caller.
export function ObservationTable({ observations, selectedId, onSelect }: Props) {
  return (
    <table className="w-full text-[10px] border-collapse">
      <thead>
        <tr className="text-text-dim uppercase tracking-wider text-[9px]">
          <th className="text-left font-medium py-1 px-1.5">Observer</th>
          <th className="text-left font-medium py-1 px-1.5">Area</th>
          <th className="text-left font-medium py-1 px-1.5">Heard</th>
          <th className="text-left font-medium py-1 px-1.5">SNR</th>
          <th className="text-left font-medium py-1 px-1.5">RSSI</th>
          <th className="text-left font-medium py-1 px-1.5">Prop</th>
          <th className="text-left font-medium py-1 px-1.5">Hops</th>
          <th className="text-left font-medium py-1 px-1.5">Path</th>
        </tr>
      </thead>
      <tbody>
        {observations.map((o) => {
          const level = snrLevel(o.snr);
          return (
            <tr
              key={o.id}
              aria-selected={o.id === selectedId}
              onClick={() => onSelect(o.id)}
              className={`cursor-pointer border-t border-border-subtle ${o.id === selectedId ? "bg-primary/8" : "hover:bg-bg-raised/40"}`}
            >
              <td className="py-1 px-1.5 text-text-normal">{o.observerName ?? o.observerId.slice(0, 8)}</td>
              <td className="py-1 px-1.5 font-mono font-bold text-primary tracking-wider">{o.iata}</td>
              <td className="py-1 px-1.5 text-text-muted"><Timestamp value={o.heardAt} /></td>
              <td className={`py-1 px-1.5 font-mono ${level ? SIGNAL_LEVEL_CLASSES[level] : "text-text-dim"}`}>
                {formatSnr(o.snr)}
              </td>
              <td className="py-1 px-1.5 font-mono text-text-muted">{o.rssi ?? "—"}</td>
              <td className="py-1 px-1.5 font-mono text-text-muted">{formatPropagation(o.propagationTimeMs)}</td>
              <td className="py-1 px-1.5 font-mono text-text-muted">{o.pathLength.hopCount}</td>
              <td className="py-1 px-1.5">
                {o.pathBytes ? (
                  <PathData pathBytes={o.pathBytes} hashSize={o.pathLength.hashSize} resolvedPath={o.resolvedPath} size="sm" />
                ) : (
                  <span className="text-text-dim">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
