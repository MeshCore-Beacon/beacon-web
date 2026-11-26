import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "../hooks/useMediaQuery";
import { BottomSheet } from "./BottomSheet";
import { CloseButton } from "./CloseButton";
import { Dropdown } from "./Dropdown";
import { fieldButtonClass, FIELD_LABEL_CLASS, FIELD_VALUE_CLASS } from "./sheet-field";
import { FieldChevron } from "./FieldChevron";
import { SheetOptionList } from "./SheetOptionList";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectDropdownProps {
  label: string;
  options: SelectOption[];
  value: string; // "" = none selected (shows allLabel)
  onChange: (value: string) => void;
  align?: "left" | "right";
  allLabel?: string;
  hideAll?: boolean; // omit the "all" entry for required fields where "" isn't a valid choice
  fullWidth?: boolean; // stretch + inline panel for the mobile filter sheet
  sheetOnMobile?: boolean; // keep the compact trigger, but open the options in a bottom sheet on phones
  showLabel?: boolean; // compact trigger: show the label beside the value (default); off keeps it as the accessible name
  disabled?: boolean;
}

// single-select dropdown styled to match the packets MultiSelectDropdown trigger

export function SelectDropdown({ label, options, value, onChange, align = "right", allLabel: allLabelProp, hideAll = false, fullWidth = false, sheetOnMobile = false, showLabel = true, disabled = false }: SelectDropdownProps) {
  const { t } = useTranslation();
  const allLabel = allLabelProp ?? t("common.all");
  const active = value !== "";
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  if (sheetOpen && !(sheetOnMobile && isMobile)) setSheetOpen(false);

  const compactTrigger = (toggle: () => void, expanded?: boolean) => (
    <button
      type="button"
      disabled={disabled}
      className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-sm border font-mono cursor-pointer transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-primary-dim bg-primary/6 text-primary"
          : "border-border bg-bg-surface text-text-muted hover:border-text-dim hover:text-text-normal"
      }`}
      onClick={toggle}
      aria-haspopup={sheetOnMobile && isMobile ? "dialog" : "listbox"}
      aria-expanded={expanded}
      aria-label={showLabel ? undefined : `${label}: ${active ? selectedLabel : allLabel}`}
    >
      {showLabel && label}
      <span className={active ? "text-primary" : "text-text-dim"}>{active ? selectedLabel : allLabel}</span>
      <span className="text-text-dim text-[9px]">▾</span>
    </button>
  );

  if (sheetOnMobile && isMobile && !fullWidth) {
    const close = () => setSheetOpen(false);
    return (
      <>
        {compactTrigger(() => setSheetOpen(true), sheetOpen)}
        {sheetOpen && (
          <BottomSheet onClose={close} label={label}>
            <div className="flex items-center justify-between px-4 pb-3 shrink-0">
              <span className="text-lg font-mono font-medium text-text-bright">{label}</span>
              <CloseButton onClose={close} label={t("common.close")} className="-mr-2 w-11! h-11!" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
              <SheetOptionList
                mode="single"
                options={options}
                isSelected={(v) => v === value}
                onPick={(v) => { onChange(v); close(); }}
                firstRow={hideAll ? undefined : { label: allLabel, selected: !active, onPick: () => { onChange(""); close(); } }}
                emptyLabel={hideAll && options.length === 0 ? t("common.noOptions") : undefined}
              />
            </div>
          </BottomSheet>
        )}
      </>
    );
  }

  return (
    <Dropdown
      align={align}
      width="w-52"
      fullWidth={fullWidth}
      renderTrigger={({ open, toggle }) => (
        fullWidth ? (
          <button type="button" className={fieldButtonClass(open)} onClick={toggle} aria-haspopup="listbox" aria-expanded={open}>
            <span className={FIELD_LABEL_CLASS}>{label}</span>
            <span className={FIELD_VALUE_CLASS}>{active ? selectedLabel : allLabel}</span>
            <FieldChevron open={open} />
          </button>
        ) : compactTrigger(toggle)
      )}
    >
      {(close) => fullWidth ? (
        <SheetOptionList
          mode="single"
          options={options}
          isSelected={(v) => v === value}
          onPick={(v) => { onChange(v); close(); }}
          firstRow={hideAll ? undefined : { label: allLabel, selected: !active, onPick: () => { onChange(""); close(); } }}
          emptyLabel={hideAll && options.length === 0 ? t("common.noOptions") : undefined}
        />
      ) : (
        <div role="listbox">
          {!hideAll && (
            <button
              type="button"
              role="option"
              aria-selected={!active}
              className={`w-full text-left px-2.5 py-1 text-xs font-mono transition-colors ${
                !active ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-text-normal/3"
              }`}
              onClick={() => { onChange(""); close(); }}
            >
              {allLabel}
            </button>
          )}
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`w-full text-left px-2.5 py-1 text-xs font-mono transition-colors ${
                  isSelected ? "text-text-bright bg-primary/10" : "text-text-muted hover:text-text-normal hover:bg-text-normal/3"
                }`}
                onClick={() => { onChange(opt.value); close(); }}
              >
                {opt.label}
              </button>
            );
          })}
          {hideAll && options.length === 0 && (
            <div className="px-2.5 py-1 text-xs font-mono text-text-dim">{t("common.noOptions")}</div>
          )}
        </div>
      )}
    </Dropdown>
  );
}
