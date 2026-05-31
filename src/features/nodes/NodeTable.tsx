import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { getNodes } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useTick } from "../../hooks/useTick";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { formatHex, microToDeg } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { DataTable, type Column } from "../../components/DataTable";
import { NodeFilterBar, type CapabilityFilter } from "./NodeFilterBar";
import { patchNodeSummary } from "./node-updates";
import type { NodeSummary } from "./types";
import type { WsManager } from "../../api/ws-manager";
import type { WsNodeUpdate } from "../../types/ws";

interface NodeTableProps {
  wsManager: WsManager;
  // shared with the Map tab (lifted to AppInner) so the detail panel persists across tab switches
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
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
      node.lat != null && node.lng != null
        ? `${microToDeg(node.lat).toFixed(2)}, ${microToDeg(node.lng).toFixed(2)}`
        : "—",
  },
];

export function NodeTable({ wsManager, selectedNodeId, onSelectNode }: NodeTableProps) {
  const region = useRegion();
  const queryClient = useQueryClient();
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
      queryClient.setQueryData<NodeSummary[]>(queryKey, (old) => patchNodeSummary(old, data));
      if (selectedNodeId === data.nodeId) {
        queryClient.invalidateQueries({ queryKey: ["node", data.nodeId] });
      }
    },
    [queryClient, queryKey, selectedNodeId],
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
          selectedKey={selectedNodeId}
          onSelect={onSelectNode}
          isLoading={isLoading}
          emptyLabel="No nodes"
        />
      </div>
    </div>
  );
}
