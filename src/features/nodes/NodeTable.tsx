import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { getNodes } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useTick } from "../../hooks/useTick";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { formatHex } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { DataTable, type Column } from "../../components/DataTable";
import { NodeFilterBar, type CapabilityFilter } from "./NodeFilterBar";
import { NodeDetailPanel } from "./NodeDetailPanel";
import type { NodeSummary } from "./types";
import type { WsManager } from "../../api/ws-manager";
import type { WsNodeUpdate } from "../../types/ws";

interface NodeTableProps {
  wsManager: WsManager;
}

const COLUMNS: Column<NodeSummary>[] = [
  {
    header: "Name",
    cell: (node) => (
      <span className={`truncate ${node.name ? "text-text-normal" : "text-text-dim italic"}`}>
        {node.name ?? formatHex(node.id)}
      </span>
    ),
  },
  {
    header: "Type",
    cell: (node) => <Badge variant="default">{node.nodeTypeName}</Badge>,
  },
  {
    header: "IATAs",
    cell: (node) =>
      node.iatas && node.iatas.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {node.iatas.map((code) => (
            <Badge key={code} variant="default">{code}</Badge>
          ))}
        </div>
      ) : (
        <span className="text-text-dim">—</span>
      ),
  },
  {
    header: "Location",
    className: "text-text-muted",
    cell: (node) =>
      node.lat != null && node.lng != null ? `${node.lat.toFixed(2)}, ${node.lng.toFixed(2)}` : "—",
  },
];

export function NodeTable({ wsManager }: NodeTableProps) {
  const region = useRegion();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [capabilityFilter, setCapabilityFilter] = useState<CapabilityFilter>("");
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");

  useTick();

  const queryKey = useMemo(
    () => ["nodes", region, typeFilter, capabilityFilter, search, searchField],
    [region, typeFilter, capabilityFilter, search, searchField],
  );

  const { data: nodes, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getNodes({
        iata: region === "*" ? undefined : region,
        type: typeFilter || undefined,
        name: searchField === "name" ? search || undefined : undefined,
        supportsMultibytePaths: capabilityFilter === "paths" || undefined,
        supportsMultibyteTraces: capabilityFilter === "traces" || undefined,
      }),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const handleNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      queryClient.setQueryData<NodeSummary[]>(queryKey, (old) => {
        if (!old) return old;
        const idx = old.findIndex((n) => n.id === data.nodeId);
        if (idx === -1) {
          // Not a node we're showing (filtered out, or past the page). Live
          // updates only patch rows already on screen — new nodes get picked up
          // by the periodic refetch, not by hammering /nodes on every off-list update.
          return old;
        }
        const updated = [...old];
        const prev = updated[idx]!;
        updated[idx] = {
          ...prev,
          name: data.name || prev.name,
          lat: data.lat ?? prev.lat,
          lng: data.lng ?? prev.lng,
        };
        return updated;
      });
      if (selectedId === data.nodeId) {
        queryClient.invalidateQueries({ queryKey: ["node", data.nodeId] });
      }
    },
    [queryClient, queryKey, selectedId],
  );

  useWsNodeUpdateHandler(wsManager, handleNodeUpdate);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0">
        <NodeFilterBar
          search={search}
          onSearchChange={setSearch}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          typeFilter={typeFilter}
          onTypeChange={setTypeFilter}
          capabilityFilter={capabilityFilter}
          onCapabilityChange={setCapabilityFilter}
        />

        <DataTable
          columns={COLUMNS}
          rows={nodes}
          rowKey={(n) => n.id}
          selectedKey={selectedId}
          onSelect={setSelectedId}
          isLoading={isLoading}
          emptyLabel="No nodes"
        />
      </div>

      {selectedId && (
        <NodeDetailPanel
          nodeId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
