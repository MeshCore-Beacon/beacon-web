import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { getObservers, getBrokers } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useTick } from "../../hooks/useTick";
import { useWsObserverStatusHandler } from "../../hooks/useWsHandlers";
import { formatHex } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { ObserverFilterBar } from "./ObserverFilterBar";
import { ObserverDetailPanel } from "./ObserverDetailPanel";
import type { ObserverSummary } from "./types";
import type { WsManager } from "../../api/ws-manager";
import type { WsObserverStatus } from "../../types/ws";

interface ObserverTableProps {
  wsManager: WsManager;
}

export function ObserverTable({ wsManager }: ObserverTableProps) {
  const region = useRegion();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    () => ["observers", region, statusFilter, typeFilter, brokerFilter],
    [region, statusFilter, typeFilter, brokerFilter],
  );

  const { data: observers, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getObservers({
        iata: region === "*" ? undefined : region,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        broker: brokerFilter || undefined,
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 text-text-dim text-xs font-mono tracking-wider">
        loading…
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0">
        <ObserverFilterBar
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          typeOptions={typeOptions}
          brokerFilter={brokerFilter}
          onBrokerChange={setBrokerFilter}
          brokerOptions={brokerNames}
        />

        <div className="flex-1 overflow-y-auto">
          {observers && observers.length > 0 ? (
            <table className="w-full text-xs font-mono">
              <thead className="sticky top-0 bg-bg-surface z-10">
                <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">IATA</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {observers.map((obs) => {
                  const isSelected = obs.id === selectedId;
                  return (
                    <tr
                      key={obs.id}
                      className={`border-b border-border/40 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/10"
                          : "hover:bg-bg-raised"
                      }`}
                      onClick={() => setSelectedId(isSelected ? null : obs.id)}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              obs.status === "online" ? "bg-green" : "bg-text-dim/30"
                            }`}
                          />
                          <span className={`truncate ${obs.displayName ? "text-text-normal" : "text-text-dim italic"}`}>
                            {obs.displayName ?? formatHex(obs.id)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {obs.observerType ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-text-normal">
                        {obs.iata}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={obs.status === "online" ? "live" : "offline"}>
                          {obs.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center h-32 text-text-muted text-xs font-mono">
              No observers
            </div>
          )}
        </div>
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
