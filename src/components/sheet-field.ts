// Shared look for the fields in the mobile filter sheet: an outlined 56px field whose label floats on
// the top border. Used by SelectDropdown and MultiSelectDropdown in their fullWidth mode.

export const fieldButtonClass = (open: boolean) =>
  `relative flex h-14 w-full items-center justify-between gap-2 rounded-md border bg-bg-surface px-4 text-left font-mono cursor-pointer transition-colors ${
    open ? "border-primary" : "border-border"
  }`;

export const FIELD_LABEL_CLASS = "absolute -top-2 left-3 bg-bg-surface px-1 font-mono text-[11px] leading-4 text-primary";
export const FIELD_VALUE_CLASS = "min-w-0 truncate text-[15px] text-text-bright";

// Outlined text input for a sheet field: same 56px box as the select fields, 16px text (no iOS zoom).
export const FIELD_INPUT_CLASS =
  "h-14 w-full rounded-md border border-border bg-bg-surface px-4 font-mono text-base text-text-bright placeholder:text-text-dim focus:border-primary focus:outline-none";
