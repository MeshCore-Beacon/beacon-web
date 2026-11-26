// Shared look for the fields in the mobile filter sheet: an outlined 56px field whose label floats on
// the top border. Used by SelectDropdown and MultiSelectDropdown in their fullWidth mode.

export const fieldButtonClass = (open: boolean) =>
  `relative flex h-14 w-full items-center justify-between gap-2 rounded-md border bg-bg-surface px-4 text-left font-mono cursor-pointer transition-colors ${
    open ? "border-primary" : "border-border"
  }`;

export const FIELD_LABEL_CLASS = "absolute -top-2 left-3 bg-bg-surface px-1 text-[11px] leading-4 text-primary";
export const FIELD_VALUE_CLASS = "min-w-0 truncate text-[15px] text-text-bright";

// Option rows under an open field: 44px tall, the current choice on the raised background.
export const optionRowClass = (selected: boolean) =>
  `flex min-h-11 w-full items-center gap-3 px-4 text-left font-mono text-[15px] transition-colors ${
    selected ? "bg-bg-raised text-text-bright" : "text-text-normal"
  }`;
