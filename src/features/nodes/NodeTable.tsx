import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { getNodes } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useTick } from "../../hooks/useTick";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { formatHex, microToDeg, timeAgoMs, formatRadio } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { Tooltip } from "../../components/Tooltip";
import { ObserverIcon } from "../../components/ObserverIcon";
import { DataTable, type Column } from "../../components/DataTable";
import { NodeFilterBar, type MultibyteFilter } from "./NodeFilterBar";
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
    sortValue: (node) => node.name ?? formatHex(node.id),
    cell: (node) => (
      <span className={`truncate ${node.name ? "text-text-normal" : "text-text-dim italic"}`}>
        {node.name ?? formatHex(node.id)}
      </span>
    ),
  },
  {
    header: "Type",
    sortValue: (node) => node.nodeTypeName,
    cell: (node) => (
      <Badge variant="default">
        {node.isObserver && (
          <Tooltip label="Observer" className="mr-1"><ObserverIcon /></Tooltip>
        )}
        {node.nodeTypeName}
      </Badge>
    ),
  },
  {
    header: "Radio",
    className: "text-text-muted",
    sortValue: (node) => formatRadio(node.radio) ?? null,
    cell: (node) => formatRadio(node.radio) ?? "—",
  },
  {
    header: "IATAs",
    cell: (node) =>
      node.iatas && node.iatas.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {node.iatas.map((entry) => (
            <Tooltip key={entry.iata} label={`last heard ${timeAgoMs(entry.lastHeard)} ago`}>
              <Badge variant="default">{entry.iata}</Badge>
            </Tooltip>
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
  const [pathsFilter, setPathsFilter] = useState<MultibyteFilter>("");
  const [tracesFilter, setTracesFilter] = useState<MultibyteFilter>("");
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");

  useTick();

  const queryKey = useMemo(
    () => ["nodes", region, typeFilter, pathsFilter, tracesFilter, search, searchField],
    [region, typeFilter, pathsFilter, tracesFilter, search, searchField],
  );

  const { data: nodes, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      getNodes({
        iata: region === "*" ? undefined : region,
        type: typeFilter || undefined,
        name: searchField === "name" ? search || undefined : undefined,
        supportsMultibytePaths: pathsFilter || undefined,
        supportsMultibyteTraces: tracesFilter || undefined,
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
          pathsFilter={pathsFilter}
          onPathsChange={setPathsFilter}
          tracesFilter={tracesFilter}
          onTracesChange={setTracesFilter}
        />

        <DataTable
          columns={COLUMNS}
          rows={nodes}
          rowKey={(n) => n.id}
          selectedKey={selectedNodeId}
          onSelect={onSelectNode}
          isLoading={isLoading}
          emptyLabel="No nodes"
          defaultSort={{ header: "Name" }}
        />
      </div>
    </div>
  );
}
