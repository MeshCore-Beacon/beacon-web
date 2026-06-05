import { SearchBar, type SearchFieldOption } from "../../components/SearchBar";
import { SelectDropdown } from "../../components/SelectDropdown";

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
  return (
    <div
      className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0"
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

      <SelectDropdown label="Status" options={STATUS_OPTIONS} value={statusFilter} onChange={onStatusChange} />

      {typeOptions.length > 0 && (
        <SelectDropdown
          label="Type"
          options={typeOptions.map((t) => ({ value: t, label: t }))}
          value={typeFilter}
          onChange={onTypeChange}
        />
      )}

      {brokerOptions.length > 0 && (
        <SelectDropdown
          label="Broker"
          options={brokerOptions.map((b) => ({ value: b, label: b }))}
          value={brokerFilter}
          onChange={onBrokerChange}
        />
      )}

      {scopeOptions.length > 0 && (
        <SelectDropdown
          label="Scope"
          options={scopeOptions.map((s) => ({ value: s, label: s }))}
          value={scopeFilter}
          onChange={onScopeChange}
        />
      )}
    </div>
  );
}
