import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string; // extra classes applied to the <td>
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  isLoading?: boolean;
  emptyLabel: string;
}

// selectable, sticky-header list table shared by the entity tabs (observers, nodes, …)

export function DataTable<T>({ columns, rows, rowKey, selectedKey, onSelect, isLoading, emptyLabel }: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 text-text-dim text-xs font-mono tracking-wider">
        loading…
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {rows && rows.length > 0 ? (
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-bg-surface z-10">
            <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
              {columns.map((col) => (
                <th key={col.header} className="text-left px-4 py-2 font-medium">{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);
              const isSelected = key === selectedKey;
              return (
                <tr
                  key={key}
                  className={`border-b border-border/40 cursor-pointer transition-colors ${
                    isSelected ? "bg-primary/10" : "hover:bg-bg-raised"
                  }`}
                  onClick={() => onSelect(isSelected ? null : key)}
                >
                  {columns.map((col) => (
                    <td key={col.header} className={`px-4 py-2 ${col.className ?? ""}`}>{col.cell(row)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="flex items-center justify-center h-32 text-text-muted text-xs font-mono">
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
