import { SearchBar, type SearchFieldOption } from "../../components/SearchBar";
import { SelectDropdown } from "../../components/SelectDropdown";
import { NODE_TYPE_OPTIONS } from "../../lib/node-types";

const CAPABILITY_OPTIONS = [
  { value: "paths", label: "Multibyte Paths" },
  { value: "traces", label: "Multibyte Traces" },
];

const SEARCH_FIELDS: SearchFieldOption[] = [
  { value: "name", label: "Name" },
];

export type CapabilityFilter = "" | "paths" | "traces";

interface NodeFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchField: string;
  onSearchFieldChange: (f: string) => void;
  typeFilter: string;
  onTypeChange: (t: string) => void;
  capabilityFilter: CapabilityFilter;
  onCapabilityChange: (c: CapabilityFilter) => void;
}

export function NodeFilterBar({
  search,
  onSearchChange,
  searchField,
  onSearchFieldChange,
  typeFilter,
  onTypeChange,
  capabilityFilter,
  onCapabilityChange,
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
        label="Capabilities"
        options={CAPABILITY_OPTIONS}
        value={capabilityFilter}
        onChange={(v) => onCapabilityChange(v as CapabilityFilter)}
      />
    </div>
  );
}
