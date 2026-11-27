export function FieldChevron({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className={`shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
