// Observer "eye" glyph. Matches the map's observer pip (OBSERVER_COLOR #c79bff in
// features/map/node-icons.ts) — kept as a literal hex so the nodes bundle doesn't pull in map code.
export function ObserverIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" className={`beacon-observer-eye shrink-0 ${className}`}>
      <path d="M2 12C5 6.5 19 6.5 22 12 19 17.5 5 17.5 2 12Z" stroke="#c79bff" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="#c79bff" />
    </svg>
  );
}
