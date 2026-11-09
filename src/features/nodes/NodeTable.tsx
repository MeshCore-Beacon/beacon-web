import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getNodesPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useScopes } from "../../hooks/useScopes";
import { useTick } from "../../hooks/useTick";
import { useInfinitePages } from "../../hooks/useInfinitePages";
import { useWsNodeUpdateHandler } from "../../hooks/useWsHandlers";
import { formatHex, timeAgoParts, formatRadio } from "../../lib/formatters";
import { hasMapLocation } from "../map/location";
import { Badge } from "../../components/Badge";
import { Tooltip } from "../../components/Tooltip";
import { Timestamp } from "../../components/Timestamp";
import { ObserverIcon } from "../../components/ObserverIcon";
import { DataTable, type Column, type TableSort } from "../../components/DataTable";
import { LoadingPill } from "../../components/LoadingPill";
import { NodeFilterBar, type MultibyteFilter } from "./NodeFilterBar";
import { nodeSearchParams } from "./node-search";
import { patchNodePages } from "./node-updates";
import { ForeignNodeBadge } from "./ForeignNodeBadge";
import type { TFunction } from "i18next";
import type { NodeSummary, NodeIATA, NodePage, NodeSort } from "./types";
import type { CursorPage } from "../../types/api";
import type { WsManager } from "../../api/ws-manager";
import type { WsNodeUpdate } from "../../types/ws";
import { EmojiText } from "../../components/EmojiText";
import { MAX_PAGE_SIZE } from "../../lib/constants";

const nodeId = (n: NodeSummary) => n.id; // stable id accessor for the paged hook's dedup and the table's row keys
const NAME_SORT: TableSort = { id: "name", direction: "asc" };

// the orders the server pages through; radio sorts only on the client fallback
function toNodeSort(id: string): NodeSort | undefined {
  switch (id) {
    case "name":
    case "type":
    case "neighbors":
    case "lastSeen":
      return id;
    default:
      return undefined;
  }
}

// Cell and card renderers can't call hooks, so the computed "last heard" label gets its own component.
function IataBadge({ entry }: { entry: NodeIATA }) {
  const { t } = useTranslation();
  useTick(); // keep the label fresh; the table only re-renders when its rows change
  const { count, unit } = timeAgoParts(entry.lastHeard);
  const ago = t("timestamp.ago", { duration: t(`timestamp.unit.${unit}`, { count }) });
  return (
    <Tooltip label={t("nodes.lastHeard", { ago })}>
      <Badge variant="default">{entry.iata}</Badge>
    </Tooltip>
  );
}

interface NodeTableProps {
  wsManager: WsManager;
  // shared with the Map tab (lifted to AppInner) so the detail panel persists across tab switches
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

function renderNodeCard(node: NodeSummary, t: TFunction) {
  const location = hasMapLocation(node)
    ? `${node.lat.toFixed(2)}, ${node.lng.toFixed(2)}`
    : null;
  return (
    <div className="flex flex-col gap-1.5 font-mono text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex-1 min-w-0 truncate ${node.name ? "text-text-normal" : "text-text-dim italic"}`}>
          <EmojiText text={node.name ?? formatHex(node.id)} />
        </span>
        {node.lastSeen != null && <Timestamp value={node.lastSeen} className="shrink-0 text-text-dim text-[11px]" />}
        <span className="shrink-0">
          <Badge variant="default">
            {node.isObserver && (
              <Tooltip label={t("nodes.observer")} className="mr-1"><ObserverIcon /></Tooltip>
            )}
            {node.nodeTypeName}
          </Badge>
        </span>
      </div>
      <div className="flex items-center gap-2 text-text-muted">
        <span>{formatRadio(node.radio) ?? "—"}</span>
        {location && <span>· {location}</span>}
        {node.knownNeighborCount > 0 && <span>· {t("nodes.neighbors", { count: node.knownNeighborCount, formatted: node.knownNeighborCount.toLocaleString() })}</span>}
      </div>
      <ForeignNodeBadge possiblyForeign={node.possiblyForeign} />
      {node.iatas && node.iatas.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {node.iatas.map((entry) => (
            <IataBadge key={entry.iata} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

export function NodeTable({ wsManager, selectedNodeId, onSelectNode }: NodeTableProps) {
  const { t } = useTranslation();
  const { iatas, regionKey, isResolved } = useRegion();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("");
  const [pathsFilter, setPathsFilter] = useState<MultibyteFilter>("");
  const [tracesFilter, setTracesFilter] = useState<MultibyteFilter>("");
  const [scopeFilter, setScopeFilter] = useState(""); // "" = Any
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");
  const [sort, setSort] = useState<TableSort>(NAME_SORT);
  // A server before 2.1 ignores sort: then every page loads and the table sorts them itself, as before.
  const [clientSort, setClientSort] = useState(false);
  // A server that doesn't send lastSeen can't sort by it either, so Last heard stays hidden there.
  const [noLastSeen, setNoLastSeen] = useState(false);

  const columns = useMemo<Column<NodeSummary>[]>(() => [
    {
      id: "name",
      header: t("nodes.colName"),
      sortValue: (node) => node.name ?? formatHex(node.id),
      width: "22%", // a share, not rem, so it gives way when the detail panel narrows the pane
      cell: (node) => (
        <span className={`block truncate ${node.name ? "text-text-normal" : "text-text-dim italic"}`} title={node.name ?? formatHex(node.id)}>
          <EmojiText text={node.name ?? formatHex(node.id)} />
        </span>
      ),
    },
    {
      id: "type",
      header: t("nodes.colType"),
      sortValue: (node) => node.nodeTypeName,
      cell: (node) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant="default">
            {node.isObserver && (
              <Tooltip label={t("nodes.observer")} className="mr-1"><ObserverIcon /></Tooltip>
            )}
            {node.nodeTypeName}
          </Badge>
          <ForeignNodeBadge possiblyForeign={node.possiblyForeign} />
        </div>
      ),
    },
    {
      id: "radio",
      header: t("nodes.colRadio"),
      className: "text-text-muted",
      sortValue: clientSort ? (node) => formatRadio(node.radio) ?? null : undefined, // the server can't sort by radio
      cell: (node) => formatRadio(node.radio) ?? "—",
    },
    {
      id: "areas",
      header: t("nodes.colAreas"),
      cell: (node) =>
        node.iatas && node.iatas.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {node.iatas.map((entry) => (
              <IataBadge key={entry.iata} entry={entry} />
            ))}
          </div>
        ) : (
          <span className="text-text-dim">—</span>
        ),
    },
    {
      id: "neighbors",
      header: t("nodes.colNeighbors"),
      className: "text-text-muted",
      sortValue: (node) => node.knownNeighborCount,
      width: "7rem",
      cell: (node) => node.knownNeighborCount.toLocaleString(),
    },
    ...(noLastSeen ? [] : [{
      id: "lastSeen",
      header: t("nodes.colLastHeard"),
      className: "text-text-muted",
      sortValue: (node) => node.lastSeen,
      firstSortDirection: "desc",
      width: "10rem",
      cell: (node) => (node.lastSeen == null ? "—" : <Timestamp value={node.lastSeen} />),
    } satisfies Column<NodeSummary>]),
    {
      id: "location",
      header: t("nodes.colLocation"),
      className: "text-text-muted",
      width: "9rem",
      cell: (node) =>
        hasMapLocation(node)
          ? `${node.lat.toFixed(2)}, ${node.lng.toFixed(2)}`
          : "—",
    },
  ], [t, clientSort, noLastSeen]);

  const renderCard = useCallback((node: NodeSummary) => renderNodeCard(node, t), [t]);

  // switching the field flips what the box means (a name vs a hex prefix), so stale text mustn't carry over
  const handleSearchFieldChange = useCallback((field: string) => {
    setSearchField(field);
    setSearch("");
  }, []);

  // derive the actual server params (name vs pubkeyPrefix, hex-guarded) and key the query on THOSE,
  // so toggling the field with an empty box is a no-op and a name never gets sent as a hex prefix
  const { name: nameParam, pubkeyPrefix: pubkeyPrefixParam } = nodeSearchParams(searchField, search);

  const serverSort = clientSort ? undefined : toNodeSort(sort.id);
  const queryKey = useMemo(
    () => ["nodes", regionKey, typeFilter, pathsFilter, tracesFilter, nameParam, pubkeyPrefixParam, scopeFilter, serverSort ?? "", serverSort ? sort.direction : ""],
    [regionKey, typeFilter, pathsFilter, tracesFilter, nameParam, pubkeyPrefixParam, scopeFilter, serverSort, sort.direction],
  );

  // The server filters and sorts; pages of 200 load as the table scrolls, a fresh first page for each
  // filter set and order. WS updates keep loaded rows live, no 30s refetch.
  const { items: nodes, loadedCount, isPaging, isError, isLoading, loadMore, firstPage } = useInfinitePages<NodeSummary, number, NodePage>({
    queryKey,
    queryFn: (page) =>
      getNodesPage(iatas, {
        cursor: page?.cursor,
        pageCursor: page?.pageCursor,
        limit: MAX_PAGE_SIZE,
        type: typeFilter || undefined,
        name: nameParam,
        pubkeyPrefix: pubkeyPrefixParam,
        supportsMultibytePaths: pathsFilter || undefined,
        supportsMultibyteTraces: tracesFilter || undefined,
        scope: scopeFilter || undefined,
        sort: serverSort,
        order: sort.direction,
      }),
    getId: nodeId,
    keepPrevious: true,
    auto: clientSort,
    enabled: isResolved !== false,
  });

  // rows with no `sort` beside them came from a server that didn't sort them
  if (!clientSort && firstPage && !firstPage.sort && firstPage.items.length > 0) setClientSort(true);
  const firstRow = firstPage?.items[0];
  if (!noLastSeen && firstRow && firstRow.lastSeen == null) {
    setNoLastSeen(true);
    if (sort.id === "lastSeen") setSort(NAME_SORT);
  }

  const scopeOptions = useScopes(scopeFilter);

  const handleNodeUpdate = useCallback(
    (data: WsNodeUpdate["data"]) => {
      // the event rides on an advert just heard, so its row's Last heard becomes now; no row moves
      queryClient.setQueryData<InfiniteData<CursorPage<NodeSummary>>>(queryKey, (old) => patchNodePages(old, data, Date.now()));
      if (selectedNodeId === data.nodeId) {
        queryClient.invalidateQueries({ queryKey: ["node", data.nodeId] });
      }
    },
    [queryClient, queryKey, selectedNodeId],
  );

  useWsNodeUpdateHandler(wsManager, handleNodeUpdate);

  return (
    <div className="flex flex-1 min-h-0 min-w-0">
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
          columns={columns}
          rows={nodes}
          rowKey={nodeId}
          selectedKey={selectedNodeId}
          onSelect={onSelectNode}
          isLoading={isLoading || isResolved === false}
          emptyLabel={t("nodes.empty")}
          sort={sort}
          onSortChange={setSort}
          presorted={!clientSort}
          onEndReached={clientSort ? undefined : loadMore}
          renderCard={renderCard}
          virtualize
          minWidth={noLastSeen ? "52rem" : "62rem"}
        />
        <LoadingPill loading={isPaging} error={isError} count={loadedCount} noun="nodes" position="bottom-3 right-3" />
      </div>
    </div>
  );
}
