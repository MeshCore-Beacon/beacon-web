import { useState } from "react";
import { SearchBar, type SearchFieldOption } from "../../components/SearchBar";
import { SelectDropdown } from "../../components/SelectDropdown";
import { FilterSheet, FiltersButton } from "../../components/FilterSheet";
import { useIsMobile } from "../../hooks/useMediaQuery";

const STATUS_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
];

const SEARCH_FIELDS: SearchFieldOption[] = [
  { value: "name", label: "Name" },
];

interface ObserverFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchField: string;
  onSearchFieldChange: (f: string) => void;
  statusFilter: string;
  onStatusChange: (s: string) => void;
  typeFilter: string;
  onTypeChange: (t: string) => void;
  typeOptions: string[];
  brokerFilter: string;
  onBrokerChange: (b: string) => void;
  brokerOptions: string[];
  scopeFilter: string;
  onScopeChange: (s: string) => void;
  scopeOptions: string[];
}

export function ObserverFilterBar({
  search,
  onSearchChange,
  searchField,
  onSearchFieldChange,
  statusFilter,
  onStatusChange,
  typeFilter,
  onTypeChange,
  typeOptions,
  brokerFilter,
  onBrokerChange,
  brokerOptions,
  scopeFilter,
  onScopeChange,
  scopeOptions,
}: ObserverFilterBarProps) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  // close the sheet when leaving mobile — derive during render, not in an effect
  if (sheetOpen && !isMobile) setSheetOpen(false);

  const activeCount = [statusFilter, typeFilter, brokerFilter, scopeFilter].filter(Boolean).length;
  const clearAll = () => {
    onStatusChange("");
    onTypeChange("");
    onBrokerChange("");
    onScopeChange("");
  };

  // shared by the desktop inline bar and the mobile filter sheet
  const controls = (fullWidth: boolean) => (
    <>
      <SelectDropdown label="Status" options={STATUS_OPTIONS} value={statusFilter} onChange={onStatusChange} fullWidth={fullWidth} />
      {typeOptions.length > 0 && (
        <SelectDropdown label="Type" options={typeOptions.map((t) => ({ value: t, label: t }))} value={typeFilter} onChange={onTypeChange} fullWidth={fullWidth} />
      )}
      {brokerOptions.length > 0 && (
        <SelectDropdown label="Broker" options={brokerOptions.map((b) => ({ value: b, label: b }))} value={brokerFilter} onChange={onBrokerChange} fullWidth={fullWidth} />
      )}
      {scopeOptions.length > 0 && (
        <SelectDropdown label="Scope" options={scopeOptions.map((s) => ({ value: s, label: s }))} value={scopeFilter} onChange={onScopeChange} fullWidth={fullWidth} />
      )}
    </>
  );

  if (isMobile) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0" role="toolbar" aria-label="Observer filters">
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
      aria-label="Observer filters"
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
