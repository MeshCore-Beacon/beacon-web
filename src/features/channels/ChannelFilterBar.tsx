import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SearchBar } from "../../components/SearchBar";
import { SelectDropdown } from "../../components/SelectDropdown";
import { FilterSheet, FiltersButton } from "../../components/FilterSheet";
import { useIsMobile } from "../../hooks/useMediaQuery";
import type { ChannelKeyFilter, ChannelHashtagFilter } from "./channel-filters";

interface ChannelFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchField: string;
  onSearchFieldChange: (f: string) => void;
  keyFilter: ChannelKeyFilter;
  onKeyChange: (v: ChannelKeyFilter) => void;
  hashtagFilter: ChannelHashtagFilter;
  onHashtagChange: (v: ChannelHashtagFilter) => void;
}

export function ChannelFilterBar({
  search,
  onSearchChange,
  searchField,
  onSearchFieldChange,
  keyFilter,
  onKeyChange,
  hashtagFilter,
  onHashtagChange,
}: ChannelFilterBarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const searchFields = [
    { value: "name", label: t("channels.fieldName") },
    { value: "hash", label: t("channels.fieldHash") },
  ];
  const keyOptions = [
    { value: "known", label: t("channels.keyKnownOption") },
    { value: "unknown", label: t("channels.keyUnknownOption") },
  ];
  const hashtagOptions = [
    { value: "true", label: t("channels.yes") },
    { value: "false", label: t("channels.no") },
  ];
  const [sheetOpen, setSheetOpen] = useState(false);
  // close the sheet when leaving mobile — derive during render, not in an effect
  if (sheetOpen && !isMobile) setSheetOpen(false);

  const activeCount = [keyFilter, hashtagFilter].filter(Boolean).length;
  const clearAll = () => {
    onKeyChange("");
    onHashtagChange("");
  };

  // shared by the desktop inline bar and the mobile filter sheet
  const controls = (fullWidth: boolean) => (
    <>
      <SelectDropdown label={t("channels.keyFilter")} options={keyOptions} allLabel={t("channels.any")} value={keyFilter} onChange={(v) => onKeyChange(v as ChannelKeyFilter)} fullWidth={fullWidth} />
      <SelectDropdown label={t("channels.hashtagFilter")} options={hashtagOptions} allLabel={t("channels.any")} value={hashtagFilter} onChange={(v) => onHashtagChange(v as ChannelHashtagFilter)} fullWidth={fullWidth} />
    </>
  );

  if (isMobile) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-subtle bg-bg-base shrink-0" role="toolbar" aria-label={t("channels.filters")}>
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
      aria-label={t("channels.filters")}
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
