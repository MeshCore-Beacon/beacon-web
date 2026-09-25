import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useClockDrift } from "./useStats";
import { DataTable, type Column } from "../../components/DataTable";
import { Badge } from "../../components/Badge";
import { IataChip } from "../../components/IataChip";
import { Timestamp } from "../../components/Timestamp";
import { formatClockDrift } from "../../lib/formatters";
import type { ClockDriftEntry } from "./types";

// every row is already past the drift threshold; flag the worst (>= 1h off) more urgently
function driftClass(seconds: number) {
  return Math.abs(seconds) >= 3600 ? "text-danger" : "text-warn";
}

// Repeaters/room servers whose advert-derived clock has drifted past the server threshold, worst
// first. Not time-windowed (each row is the node's latest reading), so there's no range selector.
export function ClockDriftTab() {
  const { t } = useTranslation();
  const clockDrift = useClockDrift();
  const loading = clockDrift.isPending || clockDrift.isLoading || clockDrift.isPlaceholderData;
  const columns = useMemo<Column<ClockDriftEntry>[]>(() => [
    {
      id: "node",
      header: t("clockDrift.node"),
      cell: (e) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className={`truncate ${e.nodeName ? "text-text-normal" : "italic text-text-dim"}`}>
            {e.nodeName ?? e.nodeId.slice(0, 8)}
          </span>
          <Badge variant="default">{e.nodeTypeName}</Badge>
        </div>
      ),
      sortValue: (e) => e.nodeName ?? e.nodeId,
    },
    {
      id: "drift",
      header: t("clockDrift.drift"),
      className: "tabular-nums",
      cell: (e) => <span className={driftClass(e.clockDriftSeconds)}>{formatClockDrift(e.clockDriftSeconds, { inSync: t("clockDrift.inSync"), ahead: t("clockDrift.ahead"), behind: t("clockDrift.behind") })}</span>,
      sortValue: (e) => Math.abs(e.clockDriftSeconds),
    },
    {
      id: "checked",
      header: t("clockDrift.checked"),
      cell: (e) => <Timestamp value={e.clockCheckedAt} />,
      sortValue: (e) => e.clockCheckedAt,
    },
    {
      id: "iatas",
      header: "IATAs",
      cell: (e) => (
        <div className="flex flex-wrap gap-1">
          {(e.iatas ?? []).map((i) => (
            <IataChip key={i.iata}>{i.iata}</IataChip>
          ))}
        </div>
      ),
    },
  ], [t]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border bg-bg-surface px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-text-muted">
        {t("clockDrift.caption")}
      </div>
      <DataTable
        columns={columns}
        rows={loading || clockDrift.isError ? undefined : clockDrift.data}
        rowKey={(e) => e.nodeId}
        selectedKey={null}
        onSelect={() => {}}
        isLoading={loading}
        emptyLabel={clockDrift.isError ? t("common.loadFailed") : t("clockDrift.empty")}
        defaultSort={{ id: "drift", direction: "desc" }}
      />
    </div>
  );
}
