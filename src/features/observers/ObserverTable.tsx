import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { getObservers, getBrokers } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useTick } from "../../hooks/useTick";
import { useWsObserverStatusHandler } from "../../hooks/useWsHandlers";
import { formatHex } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { DataTable, type Column } from "../../components/DataTable";
import { ObserverFilterBar } from "./ObserverFilterBar";
import { ObserverDetailPanel } from "./ObserverDetailPanel";
import type { ObserverSummary } from "./types";
import type { WsManager } from "../../api/ws-manager";
import type { WsObserverStatus } from "../../types/ws";

interface ObserverTableProps {
  wsManager: WsManager;
}

const COLUMNS: Column<ObserverSummary>[] = [
  {
    header: "Name",
    cell: (obs) => (
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${obs.status === "online" ? "bg-green" : "bg-text-dim/30"}`} />
        <span className={`truncate ${obs.displayName ? "text-text-normal" : "text-text-dim italic"}`}>
          {obs.displayName ?? formatHex(obs.id)}
        </span>
      </div>
    ),
  },
  {
    header: "Type",
    className: "text-text-muted",
    cell: (obs) => obs.observerType ?? "—",
  },
  {
    header: "IATA",
    className: "text-text-normal",
    cell: (obs) => obs.iata,
  },
  {
    header: "Status",
    cell: (obs) => <Badge variant={obs.status === "online" ? "live" : "offline"}>{obs.status}</Badge>,
  },
];

export function ObserverTable({ wsManager }: ObserverTableProps) {
  const region = useRegion();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [brokerFilter, setBrokerFilter] = useState("");

  const { data: brokers } = useQuery({
    queryKey: ["brokers"],
    queryFn: getBrokers,
    staleTime: 60_000,
  });

  const brokerNames = useMemo(
    () => brokers?.map((b) => b.name) ?? [],
    [brokers],
  );

  useTick();

  const queryKey = useMemo(
    () => ["observers", region, statusFilter, typeFilter, brokerFilter, search, searchField],
    [region, statusFilter, typeFilter, brokerFilter, search, searchField],
  );

  const { data: observers, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getObservers({
        iata: region === "*" ? undefined : region,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        broker: brokerFilter || undefined,
        name: searchField === "name" ? search || undefined : undefined,
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const typeOptions = useMemo(() => {
    if (!observers) return [];
    const types = new Set<string>();
    for (const obs of observers) {
      if (obs.observerType) types.add(obs.observerType);
    }
    return [...types].sort();
  }, [observers]);

  const handleObserverStatus = useCallback(
    (data: WsObserverStatus["data"]) => {
      queryClient.setQueryData<ObserverSummary[]>(queryKey, (old) => {
        if (!old) return old;
        const idx = old.findIndex((o) => o.id === data.observerId);
        if (idx === -1) {
          queryClient.invalidateQueries({ queryKey: ["observers"] });
          return old;
        }
        const updated = [...old];
        const prev = updated[idx]!;
        updated[idx] = {
          ...prev,
          status: data.online ? "online" : "offline",
          displayName: data.displayName || prev.displayName,
        };
        return updated;
      });
      // refresh detail panel if it's showing this observer
      if (selectedId === data.observerId) {
        queryClient.invalidateQueries({ queryKey: ["observer", data.observerId] });
      }
    },
    [queryClient, queryKey, selectedId],
  );

  useWsObserverStatusHandler(wsManager, handleObserverStatus);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0">
        <ObserverFilterBar
          search={search}
          onSearchChange={setSearch}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          typeOptions={typeOptions}
          brokerFilter={brokerFilter}
          onBrokerChange={setBrokerFilter}
          brokerOptions={brokerNames}
        />

        <DataTable
          columns={COLUMNS}
          rows={observers}
          rowKey={(o) => o.id}
          selectedKey={selectedId}
          onSelect={setSelectedId}
          isLoading={isLoading}
          emptyLabel="No observers"
        />
      </div>

      {selectedId && (
        <ObserverDetailPanel
          observerId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
