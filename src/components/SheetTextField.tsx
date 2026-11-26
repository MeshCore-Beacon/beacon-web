import type { KeyboardEvent } from "react";
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from "./sheet-field";

// A text input styled as a filter sheet field: floating label on the top border, never auto-focused.
export function SheetTextField({ label, value, onChange, onKeyDown, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <label className="relative block w-full">
      <span className={FIELD_LABEL_CLASS}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={FIELD_INPUT_CLASS}
      />
    </label>
  );
}
