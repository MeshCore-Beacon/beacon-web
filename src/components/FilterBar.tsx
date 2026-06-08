import { useState } from "react";
import { MultiSelectDropdown } from "./MultiSelectDropdown";
import { SearchBar, type SearchFieldOption } from "./SearchBar";
import { FilterSheet, FiltersButton } from "./FilterSheet";
import { useIsMobile } from "../hooks/useMediaQuery";
import type { SearchField } from "../features/packets/types";

interface FilterOption {
  value: string;
  label: string;
}

const PACKET_SEARCH_FIELDS: SearchFieldOption[] = [
  { value: "hash", label: "Hash" },
  { value: "path", label: "Path", disabled: true },
  { value: "payload", label: "Payload", disabled: true },
];

interface FilterBarProps {
  typeOptions: FilterOption[];
  routeOptions: FilterOption[];
  observerOptions: FilterOption[];
  scopeOptions: FilterOption[];
  activeTypes: string[];
  activeRoutes: string[];
  activeObservers: string[];
  activeScopes: string[];
  onTypesChange: (values: string[]) => void;
  onRoutesChange: (values: string[]) => void;
  onObserversChange: (values: string[]) => void;
  onScopesChange: (values: string[]) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchField: SearchField;
  onSearchFieldChange: (field: SearchField) => void;
  onClear: () => void;
}

// toolbar combining search + multi-select filter dropdowns

export function FilterBar({
  typeOptions,
  routeOptions,
  observerOptions,
  scopeOptions,
  activeTypes,
  activeRoutes,
  activeObservers,
  activeScopes,
  onTypesChange,
  onRoutesChange,
  onObserversChange,
  onScopesChange,
  search,
  onSearchChange,
  searchField,
  onSearchFieldChange,
  onClear,
}: FilterBarProps) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  // close the sheet when leaving mobile — derive during render, not in an effect
  if (sheetOpen && !isMobile) setSheetOpen(false);

  const hasFilters =
    activeTypes.length > 0 ||
    activeRoutes.length > 0 ||
    activeObservers.length > 0 ||
    activeScopes.length > 0 ||
    search.length > 0;

  // dropdown selections only (search lives in the inline bar)
  const activeCount = activeTypes.length + activeRoutes.length + activeObservers.length + activeScopes.length;

  // shared by the desktop inline bar and the mobile filter sheet
  const controls = (fullWidth: boolean) => (
    <>
      <MultiSelectDropdown label="Types" options={typeOptions} selected={activeTypes} onChange={onTypesChange} align="right" fullWidth={fullWidth} />
      <MultiSelectDropdown label="Routes" options={routeOptions} selected={activeRoutes} onChange={onRoutesChange} align="right" fullWidth={fullWidth} />
      <MultiSelectDropdown label="Observers" options={observerOptions} selected={activeObservers} onChange={onObserversChange} searchable align="right" fullWidth={fullWidth} />
      {scopeOptions.length > 0 && (
        <MultiSelectDropdown label="Scope" options={scopeOptions} selected={activeScopes} onChange={onScopesChange} align="right" fullWidth={fullWidth} />
      )}
    </>
  );

  if (isMobile) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base" role="toolbar" aria-label="Packet filters">
        <SearchBar value={search} onChange={onSearchChange} fields={PACKET_SEARCH_FIELDS} field={searchField} onFieldChange={(f) => onSearchFieldChange(f as SearchField)} />
        <FiltersButton activeCount={activeCount} onClick={() => setSheetOpen(true)} />
        {sheetOpen && (
          <FilterSheet onClose={() => setSheetOpen(false)} onClear={hasFilters ? onClear : undefined}>
            {controls(true)}
          </FilterSheet>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 gap-y-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base"
      role="toolbar"
      aria-label="Packet filters"
    >
      <SearchBar
        value={search}
        onChange={onSearchChange}
        fields={PACKET_SEARCH_FIELDS}
        field={searchField}
        onFieldChange={(f) => onSearchFieldChange(f as SearchField)}
      />

      <span className="text-border text-sm mx-0.5" aria-hidden>│</span>

      {controls(false)}

      {hasFilters && (
        <button
          type="button"
          className="text-[11px] font-mono text-text-dim hover:text-danger px-1.5 py-0.5 cursor-pointer transition-colors"
          onClick={onClear}
        >
          Clear
        </button>
      )}
    </div>
  );
}
