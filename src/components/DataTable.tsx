import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createIncrementalSort } from "../lib/incremental-sort";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState } from "./EmptyState";
import { SkeletonRows } from "./SkeletonRows";
import { useIsMobile } from "../hooks/useMediaQuery";

export interface Column<T> {
  id?: string; // stable identity for translated headers; defaults to the header text
  header: string;
  cell: (row: T) => ReactNode;
  className?: string; // extra classes applied to the <td>
  sortValue?: (row: T) => string | number | null | undefined; // column is sortable when present
  width?: string; // pinned width in a virtualized table; unpinned columns share the rest
}

export type SortDirection = "asc" | "desc";
export interface TableSort { id: string; direction: SortDirection }

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  isLoading?: boolean;
  emptyLabel: string;
  defaultSort?: ({ id: string } | { header: string }) & { direction?: SortDirection };
  // controlled sort: the header shows `sort` and a click asks onSortChange for the next one
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  // rows already arrive in `sort`'s order (the server sorted them), so they're shown as given
  presorted?: boolean;
  // called when the scroll position nears the bottom, for on-demand paging (omit = no infinite scroll)
  onEndReached?: () => void;
  // when set, rows render as stacked cards below the md breakpoint instead of a table; sort UI lives
  // in <thead>, so cards keep the defaultSort
  renderCard?: (row: T) => ReactNode;
  virtualize?: boolean; // mount only rows near the viewport; layout goes fixed, so pin widths and set a minWidth
  minWidth?: string; // the table scrolls sideways below this instead of squeezing its columns
}

// fire onEndReached once the viewport is within this many px of the list's end
const END_REACHED_THRESHOLD_PX = 200;

// same ordering as localeCompare(…, { numeric: true }), which builds a collator on every call
const textCollator = new Intl.Collator(undefined, { numeric: true });

// first-guess heights for the virtualizer; rows are measured once mounted
const ROW_ESTIMATE_PX = 38;
const CARD_ESTIMATE_PX = 100;

// selectable, sticky-header list table shared by the entity tabs (observers, nodes, …)

function DataTableView<T>({ columns, rows, rowKey, selectedKey, onSelect, isLoading, emptyLabel, defaultSort, sort: controlledSort, onSortChange, presorted = false, onEndReached, renderCard, virtualize = false, minWidth }: DataTableProps<T>) {
  const asCards = useIsMobile() && !!renderCard;
  const [ownSort, setOwnSort] = useState<TableSort>(() => ({
    id: defaultSort ? ("id" in defaultSort ? defaultSort.id : columns.find((col) => col.header === defaultSort.header)?.id ?? defaultSort.header) : "",
    direction: defaultSort?.direction ?? "asc",
  }));
  const sort = controlledSort ?? ownSort;

  function toggleSort(id: string) {
    const next: TableSort = sort.id === id
      ? { id, direction: sort.direction === "asc" ? "desc" : "asc" }
      : { id, direction: "asc" };
    if (onSortChange) onSortChange(next);
    else setOwnSort(next);
  }

  const compareRows = useMemo(() => {
    if (presorted) return undefined;
    const col = columns.find((c) => (c.id ?? c.header) === sort.id && c.sortValue);
    if (!col?.sortValue) return undefined;
    const getValue = col.sortValue;
    const dir = sort.direction === "asc" ? 1 : -1;
    return (a: T, b: T) => {
      const av = getValue(a);
      const bv = getValue(b);
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1; // empties sink to the bottom
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return textCollator.compare(String(av), String(bv)) * dir;
    };
  }, [columns, sort, presorted]);

  // paging and live patches only append or swap rows, so the last sort is reused rather than redone
  const [sortRows] = useState(() => createIncrementalSort<T>());
  const sortedRows = useMemo(
    () => (rows && compareRows ? sortRows(rows, compareRows) : rows),
    [rows, compareRows, sortRows],
  );

  // kept stable, since a new one re-places every row; cards and rows differ in height, so they cache apart
  const getItemKey = useCallback((index: number) => {
    const row = sortedRows?.[index];
    if (!row) return index;
    return asCards ? `card:${rowKey(row)}` : rowKey(row);
  }, [sortedRows, rowKey, asCards]);

  // when virtualized, spacers stand in for the rows that aren't mounted
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sortedRows?.length ?? 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (asCards ? CARD_ESTIMATE_PX : ROW_ESTIMATE_PX),
    overscan: 10,
    getItemKey,
    enabled: virtualize,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const mounted = virtualize ? virtualRows.map((item) => item.index) : Array.from(sortedRows ?? [], (_, i) => i);
  const padTop = virtualize ? (virtualRows[0]?.start ?? 0) : 0;
  const padBottom = virtualize ? virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0) : 0;
  const measureRow = virtualize ? virtualizer.measureElement : undefined;

  // a new server order starts again from its first page, so its top is what to show
  const sortKey = `${sort.id}:${sort.direction}`;
  useEffect(() => {
    if (presorted && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [presorted, sortKey]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!onEndReached) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < END_REACHED_THRESHOLD_PX) onEndReached();
  }

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <SkeletonRows />
      </div>
    );
  }

  if (asCards) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {sortedRows && sortedRows.length > 0 ? (
          <div className="flex flex-col" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {mounted.map((index) => {
              const row = sortedRows[index];
              if (!row) return null;
              const key = rowKey(row);
              const isSelected = key === selectedKey;
              // divider by list position, not mounted position, so a card's height doesn't change as others mount
              const divider = index < sortedRows.length - 1 ? "border-b border-border/40" : "";
              return (
                <button
                  key={key}
                  data-index={index}
                  ref={measureRow}
                  type="button"
                  className={`w-full text-left px-3 py-2.5 ${divider} border-l-2 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary/10 border-l-primary"
                      : "border-l-transparent hover:bg-primary/5 hover:border-l-primary/50"
                  }`}
                  onClick={() => onSelect(isSelected ? null : key)}
                >
                  {renderCard!(row)}
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState title={emptyLabel} />
        )}
      </div>
    );
  }

  // aria-rowcount/aria-rowindex tell screen readers the full size when only on-screen rows are mounted
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto" onScroll={handleScroll}>
      {sortedRows && sortedRows.length > 0 ? (
        <table
          className={`w-full text-xs font-mono ${virtualize ? "table-fixed" : ""}`}
          style={{ minWidth }}
          aria-rowcount={virtualize ? sortedRows.length + 1 : undefined}
        >
          {virtualize && (
            <colgroup>
              {columns.map((col) => <col key={col.id ?? col.header} style={{ width: col.width }} />)}
            </colgroup>
          )}
          <thead className="sticky top-0 bg-bg-surface z-10">
            <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border" aria-rowindex={virtualize ? 1 : undefined}>
              {columns.map((col) => {
                const id = col.id ?? col.header;
                if (!col.sortValue) {
                  return <th key={id} className="text-left px-4 py-2 font-medium">{col.header}</th>;
                }
                const active = sort.id === id;
                return (
                  <th key={id} className="text-left px-4 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort(id)}
                      className="flex items-center gap-1 cursor-pointer hover:text-text-normal transition-colors"
                    >
                      {col.header}
                      <span className={active ? "text-text-normal" : "text-text-dim/40"}>
                        {active ? (sort.direction === "asc" ? "▲" : "▼") : "▲"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {padTop > 0 && <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: padTop }} /></tr>}
            {mounted.map((index) => {
              const row = sortedRows[index];
              if (!row) return null;
              const key = rowKey(row);
              const isSelected = key === selectedKey;
              return (
                <tr
                  key={key}
                  data-index={index}
                  ref={measureRow}
                  aria-rowindex={virtualize ? index + 2 : undefined}
                  className={`border-b border-border/40 border-l-2 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary/10 border-l-primary"
                      : "border-l-transparent hover:bg-primary/5 hover:border-l-primary/50"
                  }`}
                  onClick={() => onSelect(isSelected ? null : key)}
                >
                  {columns.map((col) => (
                    <td key={col.id ?? col.header} className={`px-4 py-2 ${col.className ?? ""}`}>{col.cell(row)}</td>
                  ))}
                </tr>
              );
            })}
            {padBottom > 0 && <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: padBottom }} /></tr>}
          </tbody>
        </table>
      ) : (
        <EmptyState title={emptyLabel} />
      )}
    </div>
  );
}

// a parent re-rendering for its own reasons (a paging pill, a held page) leaves the rows alone
export const DataTable = memo(DataTableView) as typeof DataTableView;
