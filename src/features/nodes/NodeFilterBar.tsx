import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchBar, type SearchFieldOption } from "../../components/SearchBar";
import { SelectDropdown } from "../../components/SelectDropdown";
import { FilterSheet, FiltersButton } from "../../components/FilterSheet";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { NODE_TYPE_OPTIONS } from "../../lib/node-types";

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
  const { t } = useTranslation();
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

  const multibyteOptions = [
    { value: "true", label: t("nodeFilters.yes") },
    { value: "false", label: t("nodeFilters.no") },
  ];
  const typeOptions = NODE_TYPE_OPTIONS.map((o) => ({ ...o, label: t(`nodeTypes.${o.value}`, { defaultValue: o.label }) }));
  const searchFields: SearchFieldOption[] = [
    { value: "name", label: t("nodeFilters.fieldName") },
    { value: "pubkey", label: t("nodeFilters.fieldPubkey") },
  ];

  // shared by the desktop inline bar and the mobile filter sheet
  const controls = (fullWidth: boolean) => (
    <>
      <SelectDropdown label={t("nodeFilters.type")} options={typeOptions} allLabel={t("nodeFilters.all")} value={typeFilter} onChange={onTypeChange} fullWidth={fullWidth} />
      <SelectDropdown label={t("nodeFilters.multibytePaths")} options={multibyteOptions} allLabel={t("nodeFilters.any")} value={pathsFilter} onChange={(v) => onPathsChange(v as MultibyteFilter)} fullWidth={fullWidth} />
      <SelectDropdown label={t("nodeFilters.multibyteTraces")} options={multibyteOptions} allLabel={t("nodeFilters.any")} value={tracesFilter} onChange={(v) => onTracesChange(v as MultibyteFilter)} fullWidth={fullWidth} />
      {scopeOptions.length > 0 && (
        <SelectDropdown label={t("nodeFilters.scope")} options={scopeOptions.map((s) => ({ value: s, label: s }))} allLabel={t("nodeFilters.any")} value={scopeFilter} onChange={onScopeChange} fullWidth={fullWidth} />
      )}
    </>
  );

  if (isMobile) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0" role="toolbar" aria-label={t("nodeFilters.label")}>
        <SearchBar value={search} onChange={onSearchChange} fields={searchFields} field={searchField} onFieldChange={onSearchFieldChange} />
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
      aria-label={t("nodeFilters.label")}
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
    </div>
  );
}
