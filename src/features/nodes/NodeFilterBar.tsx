import { SearchBar, type SearchFieldOption } from "../../components/SearchBar";
import { SelectDropdown } from "../../components/SelectDropdown";
import { NODE_TYPE_OPTIONS } from "../../lib/node-types";

const MULTIBYTE_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

const SEARCH_FIELDS: SearchFieldOption[] = [
  { value: "name", label: "Name" },
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
  return (
    <div
      className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0"
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

      <SelectDropdown label="Type" options={NODE_TYPE_OPTIONS} value={typeFilter} onChange={onTypeChange} />
      <SelectDropdown
        label="Multibyte paths"
        options={MULTIBYTE_OPTIONS}
        allLabel="Any"
        value={pathsFilter}
        onChange={(v) => onPathsChange(v as MultibyteFilter)}
      />
      <SelectDropdown
        label="Multibyte traces"
        options={MULTIBYTE_OPTIONS}
        allLabel="Any"
        value={tracesFilter}
        onChange={(v) => onTracesChange(v as MultibyteFilter)}
      />
      {scopeOptions.length > 0 && (
        <SelectDropdown
          label="Scope"
          options={scopeOptions.map((s) => ({ value: s, label: s }))}
          allLabel="Any"
          value={scopeFilter}
          onChange={onScopeChange}
        />
      )}
    </div>
  );
}
