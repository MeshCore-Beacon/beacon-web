import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SearchBar, type SearchFieldOption } from "../../components/SearchBar";
import { SelectDropdown } from "../../components/SelectDropdown";
import { FilterSheet, FiltersButton } from "../../components/FilterSheet";
import { useIsMobile } from "../../hooks/useMediaQuery";

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
  trailing?: ReactNode;
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
  trailing,
}: ObserverFilterBarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const statusOptions = [
    { value: "online", label: t("observerFilters.online") },
    { value: "offline", label: t("observerFilters.offline") },
  ];
  const searchFields: SearchFieldOption[] = [{ value: "name", label: t("observerFilters.name") }];
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
      <SelectDropdown label={t("observerFilters.status")} options={statusOptions} value={statusFilter} onChange={onStatusChange} fullWidth={fullWidth} />
      {(typeOptions.length > 0 || typeFilter) && (
        <SelectDropdown label={t("observerFilters.type")} options={typeOptions.map((o) => ({ value: o, label: o }))} value={typeFilter} onChange={onTypeChange} fullWidth={fullWidth} />
      )}
      {brokerOptions.length > 0 && (
        <SelectDropdown label={t("observerFilters.broker")} options={brokerOptions.map((b) => ({ value: b, label: b }))} value={brokerFilter} onChange={onBrokerChange} fullWidth={fullWidth} />
      )}
      {scopeOptions.length > 0 && (
        <SelectDropdown label={t("observerFilters.scope")} options={scopeOptions.map((s) => ({ value: s, label: s }))} value={scopeFilter} onChange={onScopeChange} fullWidth={fullWidth} />
      )}
    </>
  );

  if (isMobile) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0" role="toolbar" aria-label={t("observerFilters.label")}>
        <SearchBar value={search} onChange={onSearchChange} fields={searchFields} field={searchField} onFieldChange={onSearchFieldChange} />
        <FiltersButton activeCount={activeCount} onClick={() => setSheetOpen(true)} />
        {trailing}
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
      aria-label={t("observerFilters.label")}
    >
      <SearchBar
        value={search}
        onChange={onSearchChange}
        fields={searchFields}
        field={searchField}
        onFieldChange={onSearchFieldChange}
      />

      <span className="text-border text-sm mx-0.5" aria-hidden>│</span>

      {controls(false)}
      {trailing}
    </div>
  );
}
