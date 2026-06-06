import { useState, useCallback, useMemo } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getNodesPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useScopes } from "../../hooks/useScopes";
import { useTick } from "../../hooks/useTick";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { patchInfinitePages } from "../../lib/infinite-pages";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { formatHex, microToDeg, timeAgoMs, formatRadio } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { Tooltip } from "../../components/Tooltip";
import { ObserverIcon } from "../../components/ObserverIcon";
import { DataTable, type Column } from "../../components/DataTable";
import { LoadingPill } from "../../components/LoadingPill";
import { NodeFilterBar, type MultibyteFilter } from "./NodeFilterBar";
import { patchNodeSummary } from "./node-updates";
import type { NodeSummary } from "./types";
import type { CursorPage } from "../../types/api";
import type { WsManager } from "../../api/ws-manager";
import type { WsNodeUpdate } from "../../types/ws";

const nodeId = (n: NodeSummary) => n.id; // stable id accessor for the paged hook's dedup

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
  const { iatas, regionKey } = useRegion();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");
  const [pathsFilter, setPathsFilter] = useState<MultibyteFilter>("");
  const [tracesFilter, setTracesFilter] = useState<MultibyteFilter>("");
  const [scopeFilter, setScopeFilter] = useState(""); // "" = Any; applied client-side over the loaded set
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");

  useTick();

  const queryKey = useMemo(
    () => ["nodes", regionKey, typeFilter, pathsFilter, tracesFilter, search, searchField],
    [regionKey, typeFilter, pathsFilter, tracesFilter, search, searchField],
  );

  // page the region's nodes 50 at a time (filters stay server-side, in the query key); rows stream
  // in as each batch lands. Loads once per filter set — WS updates keep them live, no 30s refetch.
  const { items: nodes, loadedCount, isPaging, isError, isLoading } = useInfinitePages<NodeSummary>({
    queryKey,
    queryFn: (cursor) =>
      getNodesPage(iatas, {
        cursor,
        type: typeFilter || undefined,
        name: searchField === "name" ? search || undefined : undefined,
        supportsMultibytePaths: pathsFilter || undefined,
        supportsMultibyteTraces: tracesFilter || undefined,
      }),
    getId: nodeId,
    keepPrevious: true,
  });

  // scope options are the configured scopes; the filter itself is applied client-side on defaultScope
  const scopeOptions = useScopes();

  const displayNodes = useMemo(
    () => (scopeFilter ? nodes.filter((n) => n.defaultScope === scopeFilter) : nodes),
    [nodes, scopeFilter],
  );

  const handleNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      queryClient.setQueryData<InfiniteData<CursorPage<NodeSummary>>>(queryKey, (old) =>
        patchInfinitePages(old, (items) => patchNodeSummary(items, data) ?? items),
      );
      if (selectedNodeId === data.nodeId) {
        queryClient.invalidateQueries({ queryKey: ["node", data.nodeId] });
      }
    },
    [queryClient, queryKey, selectedNodeId],
  );

  useWsNodeUpdateHandler(wsManager, handleNodeUpdate);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="relative flex flex-col flex-1 min-w-0">
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
          scopeFilter={scopeFilter}
          onScopeChange={setScopeFilter}
          scopeOptions={scopeOptions}
        />

        <DataTable
          columns={COLUMNS}
          rows={displayNodes}
          rowKey={(n) => n.id}
          selectedKey={selectedNodeId}
          onSelect={onSelectNode}
          isLoading={isLoading}
          emptyLabel="No nodes"
          defaultSort={{ header: "Name" }}
        />
        <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun="nodes" position="bottom-3 right-3" />
      </div>
    </div>
  );
}
