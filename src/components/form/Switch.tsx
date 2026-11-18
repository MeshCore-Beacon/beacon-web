// An on/off switch: a checkbox with role="switch" drawn as a track, with its state word beside it.
export function Switch({ label, checked, disabled, onChange, stateText, describedBy }: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  stateText: string;
  describedBy?: string;
}) {
  return (
    <label className={`-my-1.5 inline-flex min-h-11 shrink-0 items-center gap-2 font-mono text-xs text-text-muted ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
      <input type="checkbox" role="switch" aria-label={label} aria-describedby={describedBy} checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
      <span aria-hidden className="relative h-5 w-9 rounded-full border border-border bg-bg-raised transition-colors peer-checked:border-primary peer-checked:bg-primary peer-disabled:opacity-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary after:absolute after:left-0.5 after:top-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-text-muted after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-bg-base motion-reduce:transition-none motion-reduce:after:transition-none" />
      <span aria-hidden className="w-6">{stateText}</span>
    </label>
  );
}
