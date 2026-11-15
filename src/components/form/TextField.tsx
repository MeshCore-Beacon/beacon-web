import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { fieldClass, fieldClassRoomy, labelClass, labelClassRoomy } from "./fieldStyles";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "name" | "autoComplete"> {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  name: string;
  autoComplete: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
  roomy?: boolean;
}

export function TextField({ label, value, onChange, error, hint, trailing, roomy, className, ...input }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={roomy ? labelClassRoomy : labelClass}>{label}</label>
      <div className="relative flex min-w-0 items-center">
        <input
          {...input}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`${roomy ? fieldClassRoomy : fieldClass}${trailing ? " pr-16" : ""}${className ? ` ${className}` : ""}`}
        />
        {trailing}
      </div>
      {hint && <p id={hintId} className="text-xs text-text-muted">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
