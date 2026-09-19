import { useState, useCallback, useMemo } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getNodesPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useScopes } from "../../hooks/useScopes";
import { useTick } from "../../hooks/useTick";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { patchInfinitePages } from "../../lib/infinite-pages";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { formatHex, timeAgoMs, formatRadio } from "../../lib/formatters";
import { Badge } from "../../components/Badge";
import { Tooltip } from "../../components/Tooltip";
import { ObserverIcon } from "../../components/ObserverIcon";
import { DataTable, type Column } from "../../components/DataTable";
import { LoadingPill } from "../../components/LoadingPill";
import { NodeFilterBar, type MultibyteFilter } from "./NodeFilterBar";
import { nodeSearchParams } from "./node-search";
import { patchNodeSummary } from "./node-updates";
import { ForeignNodeBadge } from "./ForeignNodeBadge";
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
      <div className="flex flex-wrap gap-1">
        <Badge variant="default">
          {node.isObserver && (
            <Tooltip label="Observer" className="mr-1"><ObserverIcon /></Tooltip>
          )}
          {node.nodeTypeName}
        </Badge>
        <ForeignNodeBadge possiblyForeign={node.possiblyForeign} />
      </div>
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
    header: "Neighbors",
    className: "text-text-muted",
    sortValue: (node) => node.knownNeighborCount,
    cell: (node) => node.knownNeighborCount.toLocaleString(),
  },
  {
    header: "Location",
    className: "text-text-muted",
    cell: (node) =>
      node.lat != null && node.lng != null
        ? `${node.lat.toFixed(2)}, ${node.lng.toFixed(2)}`
        : "—",
  },
];

function renderNodeCard(node: NodeSummary) {
  const location =
    node.lat != null && node.lng != null
      ? `${node.lat.toFixed(2)}, ${node.lng.toFixed(2)}`
      : null;
  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex-1 min-w-0 truncate ${node.name ? "text-text-normal" : "text-text-dim italic"}`}>
          {node.name ?? formatHex(node.id)}
        </span>
        <span className="shrink-0">
          <Badge variant="default">
            {node.isObserver && (
              <Tooltip label="Observer" className="mr-1"><ObserverIcon /></Tooltip>
            )}
            {node.nodeTypeName}
          </Badge>
        </span>
      </div>
      <div className="flex items-center gap-2 text-text-muted">
        <span>{formatRadio(node.radio) ?? "—"}</span>
        {location && <span>· {location}</span>}
        {node.knownNeighborCount > 0 && <span>· {node.knownNeighborCount.toLocaleString()} neighbors</span>}
      </div>
      <ForeignNodeBadge possiblyForeign={node.possiblyForeign} />
      {node.iatas && node.iatas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {node.iatas.map((entry) => (
            <Tooltip key={entry.iata} label={`last heard ${timeAgoMs(entry.lastHeard)} ago`}>
              <Badge variant="default">{entry.iata}</Badge>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

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

  // switching the field flips what the box means (a name vs a hex prefix), so stale text mustn't carry over
  const handleSearchFieldChange = useCallback((field: string) => {
    setSearchField(field);
    setSearch("");
  }, []);

  // derive the actual server params (name vs pubkeyPrefix, hex-guarded) and key the query on THOSE,
  // so toggling the field with an empty box is a no-op and a name never gets sent as a hex prefix
  const { name: nameParam, pubkeyPrefix: pubkeyPrefixParam } = nodeSearchParams(searchField, search);

  const queryKey = useMemo(
    () => ["nodes", regionKey, typeFilter, pathsFilter, tracesFilter, nameParam, pubkeyPrefixParam],
    [regionKey, typeFilter, pathsFilter, tracesFilter, nameParam, pubkeyPrefixParam],
  );

  // page the region's nodes 50 at a time (filters stay server-side, in the query key); rows stream
  // in as each batch lands. Loads once per filter set — WS updates keep them live, no 30s refetch.
  const { items: nodes, loadedCount, isPaging, isError, isLoading } = useInfinitePages<NodeSummary>({
    queryKey,
    queryFn: (cursor) =>
      getNodesPage(iatas, {
        cursor,
        type: typeFilter || undefined,
        name: nameParam,
        pubkeyPrefix: pubkeyPrefixParam,
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
          onSearchFieldChange={handleSearchFieldChange}
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
          renderCard={renderNodeCard}
        />
        <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun="nodes" position="bottom-3 right-3" />
      </div>
    </div>
  );
}
