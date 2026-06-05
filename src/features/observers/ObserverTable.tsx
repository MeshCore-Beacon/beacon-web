import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { getObservers, getBrokers } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useScopes } from "../../hooks/useScopes";
import { useTick } from "../../hooks/useTick";
import { useWsObserverStatusHandler } from "../../hooks/useWsHandlers";
import { formatHex, formatRadio } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { DataTable, type Column } from "../../components/DataTable";
import { ObserverFilterBar } from "./ObserverFilterBar";
import { ObserverDetailPanel } from "./ObserverDetailPanel";
import type { ObserverSummary } from "./types";
import type { WsManager } from "../../api/ws-manager";
import type { WsObserverStatus } from "../../types/ws";

interface ObserverTableProps {
  wsManager: WsManager;
  selectedObserverId: string | null;
  onSelectObserver: (id: string | null) => void;
}

const COLUMNS: Column<ObserverSummary>[] = [
  {
    header: "Name",
    sortValue: (obs) => obs.displayName ?? formatHex(obs.id),
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
    sortValue: (obs) => obs.observerType ?? null,
    cell: (obs) => obs.observerType ?? "—",
  },
  {
    header: "Radio",
    className: "text-text-muted",
    sortValue: (obs) => formatRadio(obs.radio) ?? null,
    cell: (obs) => formatRadio(obs.radio) ?? "—",
  },
  {
    header: "IATA",
    className: "text-text-normal",
    sortValue: (obs) => obs.iata,
    cell: (obs) => obs.iata,
  },
  {
    header: "Status",
    sortValue: (obs) => obs.status,
    cell: (obs) => <Badge variant={obs.status === "online" ? "live" : "offline"}>{obs.status}</Badge>,
  },
];

export function ObserverTable({ wsManager, selectedObserverId, onSelectObserver }: ObserverTableProps) {
  const { iatas, regionKey } = useRegion();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [brokerFilter, setBrokerFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState(""); // "" = Any; applied client-side over the loaded set

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
    () => ["observers", regionKey, statusFilter, typeFilter, brokerFilter, search, searchField],
    [regionKey, statusFilter, typeFilter, brokerFilter, search, searchField],
  );

  const { data: observers, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getObservers({
        iatas,
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

  // scope options are the configured scopes; the filter itself is applied client-side on obs.scopes
  const scopeOptions = useScopes();

  const displayObservers = useMemo(
    () => (scopeFilter ? (observers ?? []).filter((o) => o.scopes?.includes(scopeFilter)) : observers),
    [observers, scopeFilter],
  );

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
      if (selectedObserverId === data.observerId) {
        queryClient.invalidateQueries({ queryKey: ["observer", data.observerId] });
      }
    },
    [queryClient, queryKey, selectedObserverId],
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
          scopeFilter={scopeFilter}
          onScopeChange={setScopeFilter}
          scopeOptions={scopeOptions}
        />

        <DataTable
          columns={COLUMNS}
          rows={displayObservers}
          rowKey={(o) => o.id}
          selectedKey={selectedObserverId}
          onSelect={onSelectObserver}
          isLoading={isLoading}
          emptyLabel="No observers"
          defaultSort={{ header: "Name" }}
        />
      </div>

      {selectedObserverId && (
        <ObserverDetailPanel
          observerId={selectedObserverId}
          onClose={() => onSelectObserver(null)}
        />
      )}
    </div>
  );
}
