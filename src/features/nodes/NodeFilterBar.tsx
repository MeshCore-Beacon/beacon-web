import { useState } from "react";
import { SearchBar, type SearchFieldOption } from "../../components/SearchBar";
import { SelectDropdown } from "../../components/SelectDropdown";
import { FilterSheet, FiltersButton } from "../../components/FilterSheet";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { NODE_TYPE_OPTIONS } from "../../lib/node-types";

const MULTIBYTE_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

const SEARCH_FIELDS: SearchFieldOption[] = [
  { value: "name", label: "Name" },
  { value: "pubkey", label: "Public Key" },
];

// "" means no filter (Any)
export type MultibyteFilter = "" | "true" | "false";

interface NodeFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchField: string;
  onSearchFieldChange: (f: string) => void;
  typeFilter: string;
  onTypeChange: (t: string) => void;
  pathsFilter: MultibyteFilter;
  onPathsChange: (v: MultibyteFilter) => void;
  tracesFilter: MultibyteFilter;
  onTracesChange: (v: MultibyteFilter) => void;
  scopeFilter: string;
  onScopeChange: (s: string) => void;
  scopeOptions: string[];
}

export function NodeFilterBar({
  search,
  onSearchChange,
  searchField,
  onSearchFieldChange,
  typeFilter,
  onTypeChange,
  pathsFilter,
  onPathsChange,
  tracesFilter,
  onTracesChange,
  scopeFilter,
  onScopeChange,
  scopeOptions,
}: NodeFilterBarProps) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  // close the sheet when leaving mobile — derive during render, not in an effect
  if (sheetOpen && !isMobile) setSheetOpen(false);

  const activeCount = [typeFilter, pathsFilter, tracesFilter, scopeFilter].filter(Boolean).length;
  const clearAll = () => {
    onTypeChange("");
    onPathsChange("");
    onTracesChange("");
    onScopeChange("");
  };

  // shared by the desktop inline bar and the mobile filter sheet
  const controls = (fullWidth: boolean) => (
    <>
      <SelectDropdown label="Type" options={NODE_TYPE_OPTIONS} value={typeFilter} onChange={onTypeChange} fullWidth={fullWidth} />
      <SelectDropdown label="Multibyte paths" options={MULTIBYTE_OPTIONS} allLabel="Any" value={pathsFilter} onChange={(v) => onPathsChange(v as MultibyteFilter)} fullWidth={fullWidth} />
      <SelectDropdown label="Multibyte traces" options={MULTIBYTE_OPTIONS} allLabel="Any" value={tracesFilter} onChange={(v) => onTracesChange(v as MultibyteFilter)} fullWidth={fullWidth} />
      {scopeOptions.length > 0 && (
        <SelectDropdown label="Scope" options={scopeOptions.map((s) => ({ value: s, label: s }))} allLabel="Any" value={scopeFilter} onChange={onScopeChange} fullWidth={fullWidth} />
      )}
    </>
  );

  if (isMobile) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0" role="toolbar" aria-label="Node filters">
        <SearchBar value={search} onChange={onSearchChange} fields={SEARCH_FIELDS} field={searchField} onFieldChange={onSearchFieldChange} />
        <FiltersButton activeCount={activeCount} onClick={() => setSheetOpen(true)} />
        {sheetOpen && (
          <FilterSheet onClose={() => setSheetOpen(false)} onClear={activeCount > 0 ? clearAll : undefined}>
            {controls(true)}
          </FilterSheet>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 gap-y-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0"
      role="toolbar"
      aria-label="Node filters"
    >
      <SearchBar
        value={search}
        onChange={onSearchChange}
        fields={SEARCH_FIELDS}
        field={searchField}
        onFieldChange={onSearchFieldChange}
      />

      <span className="text-border text-sm mx-0.5" aria-hidden>│</span>

      {controls(false)}
    </div>
  );
}
